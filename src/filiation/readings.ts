/**
 * The readings of a set of copies, collated all at once: every copy
 * against every other, so that what counts as one reading does not
 * depend on the order the copies are taken in.
 */
import { v5 } from "uuid"
import { Edition } from "../model/Edition.js"
import { HorizontalSpan, HoleChain } from "../model/Feature.js"
import { asSymbols, barOf, RollCopy } from "../model/RollCopy.js"
import { AnySymbol, Expression } from "../model/Symbol.js"
import { idOf } from "../model/Assumption.js"
import { Millimeters, mm } from "../model/Quantity.js"
import { keyOf, TrackerBar, TrackMeaning } from "../systems/TrackerBar.js"
import { medianOf, spreadOf } from "../collation/statistics.js"
import { departureThreshold } from "../collation/scatter.js"
import { CollationTolerance } from "../collation/Collation.js"
import { substitutionsBetween } from "../collation/substitution.js"
import { transfersOf } from "./systems.js"

/** The namespace the names of collated readings are minted in, so that the same carriers always give the same name. */
const READINGS = '0b7a3f5e-5d0c-4a59-9d55-4b2b6c1f6a70'

/**
 * One copy's reading of one feature: what the copy's bar reads off it,
 * and where.
 * @category Filiation
 */
export interface CopyReading {
    /** The feature and what it is read as, since a feature across two positions reads as two commands. */
    id: string
    copy: string
    feature: string
    meaning: TrackMeaning
    key: string
    place: HorizontalSpan
}

/**
 * A reading the copies share: the readings of one meaning that lie at
 * about the same place, at most one of each copy.
 * @category Filiation
 */
export interface CollatedReading {
    /**
     * A name for the reading, the same for the same meaning on the same
     * features, so that collating again gives it again.
     */
    id: string
    meaning: TrackMeaning
    key: string
    /** The features carrying it, each on another copy. */
    carriers: string[]
    /** The copies carrying it, in the order the collation was given them. */
    copies: string[]
    /** Where it lies: the median of its carriers at either end. */
    place: HorizontalSpan
}

/**
 * How far two copies may put one reading apart, and where that window
 * is centred: the systematic difference between the two and the scatter
 * about it, as `scatter.ts` measures a derivation's.
 * @category Filiation
 */
export interface PairWindow extends CollationTolerance {
    /** How many readings the window was measured on; none where it fell back on the default. */
    n: number
}

/**
 * A command one copy holds where another latches, as a transfer into a
 * system with held commands spells it: the readings of the one standing
 * for the readings of the other.
 * @category Filiation
 */
export interface Recoding {
    /** The collated readings of the latched pair. */
    replaced: string[]
    /** The collated readings of the held command. */
    by: string[]
}

/**
 * How far the later copy of a pair lies from the earlier one at a place
 * along the roll, the later less the earlier.
 * @category Filiation
 */
export interface Drift {
    /** Where on the earlier copy. */
    at: Millimeters
    by: Millimeters
}

/**
 * The collation of a set of copies.
 * @category Filiation
 */
export interface CopyCollation {
    copies: string[]
    readings: CollatedReading[]
    /** By pair of copies (`a|b|group`, the pair in the order the copies were given), the window used. */
    windows: Record<string, PairWindow>
    /**
     * By pair of copies (`a|b`), how the later lies against the earlier
     * along the roll, where the two share enough for it to be read off.
     * A window is centred on this, place by place, and its own offsets
     * and tolerances are measured about it.
     */
    drift: Record<string, Drift[]>
    recodings: Recoding[]
    /** By copy, where its text begins and ends. */
    extent: Record<string, { from: Millimeters, to: Millimeters }>
}

/**
 * How far apart the first estimate takes two readings to be the same:
 * far beyond any scatter, near enough to stay off the next command of
 * the same kind.
 */
const PROVISIONAL = mm(8)

/** The window between a pair too seldom read together for a scatter to be read off. */
const FALLBACK: PairWindow = { n: 0, toleranceStart: mm(5), toleranceEnd: mm(5) }

/**
 * No window is narrower than this, the pitch of a chain of holes. Most
 * readings of two copies lie within a few tenths of a millimetre of
 * each other once the drift is taken off, and a window drawn from that
 * alone is a millimetre wide. But a chain begins and ends on the
 * perforator's own steps, a scan reads its first and last hole or
 * misses it, and one reading in a hundred lies a millimetre or two off
 * for that and no other reason. Two punchings less than a pitch apart
 * are one hole.
 */
const NARROWEST = mm(3)

/** Below this many shared readings no scatter is read off a pair. */
const FEWEST = 10

/** Two readings further apart than this are never compared. */
const REACH = mm(40)

/** How far a held command may lie from the latched pair it stands for. */
const RECODING_TOLERANCE: CollationTolerance = { toleranceStart: mm(5), toleranceEnd: mm(5) }

const groupOf = (meaning: TrackMeaning): string => meaning.type

/**
 * What the copy's own punching put on the paper and its bar reads as
 * text, in order of onset.
 *
 * A later alteration of the copy is not part of what was punched from
 * the version, so only the features of the production count. Where the
 * bar finds the roll's end, reading stops, and the end itself is not
 * read. A command no other scale has a word for (the motor, the rewind,
 * the electric cut-off) runs the instrument rather than the music and
 * is no reading either.
 * @category Filiation
 */
export const readingsOfCopy = (copy: Readonly<RollCopy>): CopyReading[] => {
    const bar = barOf(copy)
    const chains = (copy.production?.produced ?? []).filter((feature): feature is HoleChain => feature.type === 'HoleChain')
    const end = bar.endsAt(chains)
    const place = new Map(chains.map(chain => [chain.id, chain.horizontal]))

    return asSymbols(chains, bar)
        .filter(symbol => symbol.type !== 'expression' || bar.operationOf(symbol.expressionType) !== undefined)
        .flatMap((symbol): CopyReading[] => {
            if (symbol.type === 'text') return []
            const feature = idOf(symbol.carriers[0])
            const horizontal = place.get(feature)!
            if (end !== undefined && horizontal.from >= end.at) return []
            const meaning: TrackMeaning = symbol.type === 'note'
                ? { type: 'note', pitch: symbol.pitch }
                : { type: 'expression', expressionType: symbol.expressionType, scope: symbol.scope }
            const key = keyOf(meaning)
            return [{ id: `${feature}|${key}`, copy: copy.id, feature, meaning, key, place: { ...horizontal } }]
        })
        .sort((a, b) => a.place.from - b.place.from || compare(a.id, b.id))
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const groupBy = <T,>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
    const groups = new Map<string, T[]>()
    for (const item of items) {
        const k = key(item)
        const group = groups.get(k)
        if (group) group.push(item)
        else groups.set(k, [item])
    }
    return groups
}

const pairKey = (a: string, b: string, group: string) => `${a}|${b}|${group}`

/** How far apart along the roll the drift of a pair is read off, and over how long a stretch at the least. */
const DRIFT_STEP = mm(250)
const DRIFT_SPAN = mm(500)

/** How finely the displacements of a stretch are told apart when they vote for its drift. */
const DRIFT_BIN = mm(0.5)

/**
 * How far apart two copies may lie for their drift still to be found.
 * Copies cut to different lengths, aligned by one scale over the whole
 * roll, stand five centimetres apart in places.
 */
const DRIFT_REACH = mm(200)

/** How many readings have to agree on the drift of a stretch, and how far a stretch thin in readings is widened to find them. */
const DRIFT_VOTES = 40
const DRIFT_WIDEST = mm(4000)

/** How near a line the drift of neighbouring stretches has to lie to be taken for one. */
const DRIFT_STRAIGHT = mm(1)

/**
 * How far the drift may change from one stretch to the next and still
 * run between them. Paper and a reader's spool change it by a
 * millimetre or two in a quarter of a metre; more is a step, as at a
 * splice, and a reading between the two stretches lies on one side of
 * it or the other.
 */
const DRIFT_STEPPED = mm(3)

/**
 * How the later copy of a pair lies against the earlier along the roll.
 *
 * One shift and one scale carry a copy onto the axis, and two papers do
 * not keep to that over fifteen metres: copies of one roll bow against
 * each other by millimetres, a roll read on a pneumatic reader by
 * centimetres, and where a roll was spliced the offset steps. A window
 * a few millimetres wide, centred on one offset for the whole roll,
 * then loses every reading of the stretches that lie off it, and each
 * copy is read as holding notes of its own that all of them hold.
 *
 * So the offset is read off stretch by stretch. Every reading of the
 * earlier copy is set against every reading of the same meaning on the
 * later within reach, and the displacements vote: readings that are the
 * same lie apart by the drift of their stretch, whatever else stands
 * near them by anything at all. What most of a stretch agrees on is its
 * drift, at the place its agreeing readings lie about.
 */
const driftBetween = (one: readonly CopyReading[], other: readonly CopyReading[]): Drift[] => {
    const otherByKey = groupBy(other, reading => reading.key)
    const votes: { at: number, by: number }[] = []
    for (const a of one) {
        for (const b of otherByKey.get(a.key) ?? []) {
            const by = b.place.from - a.place.from
            if (Math.abs(by) <= DRIFT_REACH) votes.push({ at: a.place.from, by })
        }
    }
    if (votes.length < FEWEST) return []
    votes.sort((x, y) => x.at - y.at)

    const bins = Math.round(2 * DRIFT_REACH / DRIFT_BIN) + 1
    const binOf = (by: number) => Math.round((by + DRIFT_REACH) / DRIFT_BIN)
    const zero = binOf(0)
    /** The first vote at or beyond a place. */
    const firstFrom = (at: number): number => {
        let low = 0
        let high = votes.length
        while (low < high) {
            const middle = (low + high) >> 1
            if (votes[middle].at < at) low = middle + 1
            else high = middle
        }
        return low
    }
    /**
     * What the votes of a stretch agree on. Where the drift changes
     * across the stretch, the displacements that agree form a run rather
     * than one value. Where several runs are as good, as a repeated note
     * agrees with itself at every multiple of its period, the one
     * nearest nought is taken. The drift is the middle one of the run's
     * displacements, at the middle one of their places.
     */
    const agreedOver = (centre: number, span: number): Drift & { held: number } | undefined => {
        const first = firstFrom(centre - span / 2)
        const last = firstFrom(centre + span / 2)
        const counts = new Float64Array(bins)
        for (let i = first; i < last; i++) counts[binOf(votes[i].by)]++
        // A displacement and its two neighbours, so that one that falls between two bins is not split.
        const agreed = (bin: number) => counts[bin] + (counts[bin - 1] ?? 0) + (counts[bin + 1] ?? 0)
        let most = 0
        for (let bin = 0; bin < bins; bin++) most = Math.max(most, agreed(bin))
        if (most < FEWEST) return undefined

        let run: { from: number, to: number } | undefined
        const awayFromNought = (candidate: { from: number, to: number }) =>
            candidate.from <= zero && zero <= candidate.to ? 0 : Math.min(Math.abs(candidate.from - zero), Math.abs(candidate.to - zero))
        // A run is what holds together at half the best agreement, and counts where it comes near the best somewhere.
        for (let bin = 0; bin < bins; bin++) {
            if (agreed(bin) < 0.5 * most) continue
            const from = bin
            let peak = agreed(bin)
            while (bin + 1 < bins && agreed(bin + 1) >= 0.5 * most) peak = Math.max(peak, agreed(++bin))
            if (peak < 0.9 * most) continue
            const candidate = { from, to: bin }
            if (!run || awayFromNought(candidate) < awayFromNought(run)) run = candidate
        }
        if (!run) return undefined
        const lowest = (run.from - 1.5) * DRIFT_BIN - DRIFT_REACH
        const highest = (run.to + 1.5) * DRIFT_BIN - DRIFT_REACH
        const holding = votes.slice(first, last).filter(vote => vote.by >= lowest && vote.by <= highest)
        const by = medianOf(holding.map(vote => mm(vote.by)))
        const at = medianOf(holding.map(vote => mm(vote.at)))
        return by === undefined || at === undefined ? undefined : { at, by, held: holding.length }
    }

    const read: Drift[] = []
    const from = votes[0].at
    const to = votes[votes.length - 1].at
    for (let centre = from; centre <= to + DRIFT_STEP / 2; centre += DRIFT_STEP) {
        // A stretch thin in readings is widened until enough of them agree, so that its drift is not read off a handful.
        let found: Drift & { held: number } | undefined
        for (let span: number = DRIFT_SPAN; span <= DRIFT_WIDEST; span *= 2) {
            found = agreedOver(centre, span) ?? found
            if (found && found.held >= DRIFT_VOTES) break
        }
        // Stretches at the ends of the roll gather about the same readings, and are one.
        if (found && (read.length === 0 || found.at > read[read.length - 1].at + DRIFT_STEP / 4)) read.push({ at: found.at, by: found.by })
    }

    // Each stretch wavers by a fraction of the scatter of its readings. Where it and its neighbours lie on
    // a line, the line is taken; where they do not, as at a step, it stands as it was read.
    return read.map((knot, index): Drift => {
        const around = read.slice(Math.max(0, index - 2), index + 3)
        if (around.length < 3) return knot
        const meanAt = around.reduce((sum, other) => sum + other.at, 0) / around.length
        const meanBy = around.reduce((sum, other) => sum + other.by, 0) / around.length
        const slope = around.reduce((sum, other) => sum + (other.at - meanAt) * (other.by - meanBy), 0)
            / around.reduce((sum, other) => sum + (other.at - meanAt) ** 2, 0)
        const along = (other: Drift) => meanBy + slope * (other.at - meanAt)
        return around.every(other => Math.abs(other.by - along(other)) <= DRIFT_STRAIGHT) ? { at: knot.at, by: mm(along(knot)) } : knot
    })
}

/**
 * The drift of a pair at a place: straight between the stretches it was
 * read off, and on beyond the outermost as it ran towards it. Between
 * two stretches a step apart it is either the one's or the other's, and
 * both are given.
 */
const driftsAt = (drift: readonly Drift[] | undefined, at: number): number[] => {
    if (!drift || drift.length === 0) return [0]
    if (drift.length === 1) return [drift[0].by]
    const beyond = (edge: Drift, inner: Drift): number => {
        const stepped = Math.abs(edge.by - inner.by) > DRIFT_STEPPED
        return stepped ? edge.by : edge.by + (edge.by - inner.by) * (at - edge.at) / (edge.at - inner.at)
    }
    if (at <= drift[0].at) return [beyond(drift[0], drift[1])]
    const end = drift[drift.length - 1]
    if (at >= end.at) return [beyond(end, drift[drift.length - 2])]
    let low = 0
    let high = drift.length - 1
    while (high - low > 1) {
        const middle = (low + high) >> 1
        if (drift[middle].at <= at) low = middle
        else high = middle
    }
    const [a, b] = [drift[low], drift[high]]
    if (Math.abs(b.by - a.by) > DRIFT_STEPPED) return [a.by, b.by]
    return [a.by + (b.by - a.by) * (at - a.at) / (b.at - a.at)]
}

/**
 * The reading of the other copy nearest in onset to where the drift puts
 * this one, within the provisional window, ties to the smaller id.
 * `shift` is the drift from this copy to the other at the reading.
 */
const nearestOf = (reading: CopyReading, others: readonly CopyReading[], shift = 0): CopyReading | undefined => {
    let best: CopyReading | undefined
    let distance = Infinity
    for (const other of others) {
        const d = Math.abs(other.place.from - reading.place.from - shift)
        if (d < distance || (d === distance && best && other.id < best.id)) {
            best = other
            distance = d
        }
    }
    return distance <= PROVISIONAL ? best : undefined
}

/**
 * The window of every pair of copies, read off the readings they share
 * at first sight: for each meaning, the mutually nearest onsets within a
 * wide provisional window about where the drift of the pair puts them.
 * Their displacements beyond that drift, the later copy less the
 * earlier, give the centre (the median) and the scatter about it (the
 * median absolute deviation as a standard deviation), and the window is
 * the scatter times the threshold beyond which fewer than one reading of
 * a sample of that size would fall by chance.
 */
const windowsOf = (
    copies: readonly string[],
    byKey: ReadonlyMap<string, CopyReading[]>,
    drift: Readonly<Record<string, Drift[]>>
): Record<string, PairWindow> => {
    const samples = new Map<string, { from: Millimeters[], to: Millimeters[] }>()
    for (const readings of byKey.values()) {
        const group = groupOf(readings[0].meaning)
        const byCopy = groupBy(readings, reading => reading.copy)
        for (let i = 0; i < copies.length; i++) {
            for (let j = i + 1; j < copies.length; j++) {
                const one = byCopy.get(copies[i]) ?? []
                const other = byCopy.get(copies[j]) ?? []
                const between = drift[`${copies[i]}|${copies[j]}`]
                for (const a of one) {
                    // Where the drift steps, a reading is no measure of the scatter about it.
                    const [local, stepped] = driftsAt(between, a.place.from)
                    if (stepped !== undefined) continue
                    const b = nearestOf(a, other, local)
                    if (!b || nearestOf(b, one, -local) !== a) continue
                    const key = pairKey(copies[i], copies[j], group)
                    const sample = samples.get(key) ?? { from: [], to: [] }
                    sample.from.push(mm(b.place.from - a.place.from - local))
                    sample.to.push(mm(b.place.to - a.place.to - local))
                    samples.set(key, sample)
                }
            }
        }
    }

    const windows: Record<string, PairWindow> = {}
    for (const [key, sample] of samples) {
        const start = spreadOf(sample.from)
        const end = spreadOf(sample.to)
        if (!start || !end || sample.from.length < FEWEST || start.sigma === 0 || end.sigma === 0) continue
        const k = departureThreshold(sample.from.length)
        windows[key] = {
            n: sample.from.length,
            offsetStart: start.median,
            offsetEnd: end.median,
            toleranceStart: mm(Math.max(k * start.sigma, NARROWEST)),
            toleranceEnd: mm(Math.max(k * end.sigma, NARROWEST))
        }
    }
    return windows
}

/** How far apart two readings lie, in units of the window of their copies; above one they are not the same. */
const distanceIn = (
    windows: Readonly<Record<string, PairWindow>>,
    drift: Readonly<Record<string, Drift[]>>,
    order: ReadonlyMap<string, number>,
    x: CopyReading,
    y: CopyReading
): number => {
    const [a, b] = order.get(x.copy)! < order.get(y.copy)! ? [x, y] : [y, x]
    const window = windows[pairKey(a.copy, b.copy, groupOf(a.meaning))] ?? FALLBACK
    const apart = (local: number): number => Math.max(
        Math.abs(b.place.from - a.place.from - local - (window.offsetStart ?? 0)) / window.toleranceStart,
        Math.abs(b.place.to - a.place.to - local - (window.offsetEnd ?? 0)) / window.toleranceEnd)
    return Math.min(...driftsAt(drift[`${a.copy}|${b.copy}`], a.place.from).map(apart))
}

/** The readings in clusters: nearest pairs first, never two readings of one copy in one cluster. */
const clustered = (readings: readonly CopyReading[], edges: readonly { x: CopyReading, y: CopyReading }[]): CopyReading[][] => {
    const parent = new Map(readings.map(reading => [reading.id, reading.id]))
    const members = new Map(readings.map(reading => [reading.id, [reading]]))
    const find = (id: string): string => {
        let root = id
        while (parent.get(root) !== root) root = parent.get(root)!
        parent.set(id, root)
        return root
    }
    for (const { x, y } of edges) {
        const a = find(x.id)
        const b = find(y.id)
        if (a === b) continue
        const one = members.get(a)!
        const other = members.get(b)!
        const copies = new Set(one.map(reading => reading.copy))
        if (other.some(reading => copies.has(reading.copy))) continue
        const [root, child] = a < b ? [a, b] : [b, a]
        parent.set(child, root)
        members.set(root, [...members.get(root)!, ...members.get(child)!])
        members.delete(child)
    }
    return [...members.values()]
}

const readingId = (key: string, carriers: readonly string[]): string =>
    `symbol_${v5(`${key}|${[...carriers].sort().join(',')}`, READINGS)}`

const asCollated = (members: readonly CopyReading[], order: ReadonlyMap<string, number>): CollatedReading => {
    const sorted = [...members].sort((a, b) => order.get(a.copy)! - order.get(b.copy)!)
    const carriers = sorted.map(reading => reading.feature)
    return {
        id: readingId(sorted[0].key, carriers),
        meaning: sorted[0].meaning,
        key: sorted[0].key,
        carriers,
        copies: sorted.map(reading => reading.copy),
        place: {
            unit: 'mm',
            from: medianOf(sorted.map(reading => reading.place.from))!,
            to: medianOf(sorted.map(reading => reading.place.to))!
        }
    }
}

/**
 * Where the copies of a system re-cut from another hold what the other
 * latches: for each such pair of copies, the held commands that stand
 * for a latched pair, as `substitutionsBetween` finds them. Each is
 * stated once, however many copies of the older system it was found
 * against.
 */
const recodingsOf = (
    edition: Pick<Edition, 'copies'>,
    copies: readonly string[],
    readingsOf: ReadonlyMap<string, readonly CopyReading[]>,
    collatedOf: ReadonlyMap<string, string>
): Recoding[] => {
    const systemOf = new Map(copies.map(id => [id, barOf(edition.copies.find(copy => copy.id === id)!).id]))
    const transfers = transfersOf()
    const asExpression = (reading: CopyReading): Expression =>
        ({ type: 'expression', id: reading.id, carriers: [], ...(reading.meaning as Pick<Expression, 'expressionType' | 'scope'>) })
    const placeOf = new Map([...readingsOf.values()].flat().map(reading => [reading.id, reading.place]))
    const locate = (symbol: AnySymbol) => placeOf.get(symbol.id)

    const found = new Map<string, Recoding>()
    for (const newer of copies) {
        for (const older of copies) {
            if (!transfers.get(systemOf.get(older)!)?.has(systemOf.get(newer)!)) continue
            const own = readingsOf.get(newer)!.filter(reading => reading.meaning.type === 'expression').map(asExpression)
            const inherited = readingsOf.get(older)!.filter(reading => reading.meaning.type === 'expression').map(asExpression)
            for (const substitution of substitutionsBetween(own, inherited, locate, RECODING_TOLERANCE)) {
                const by = [...new Set(substitution.by.map(symbol => collatedOf.get(symbol.id)!))].sort()
                const replaced = [...new Set(substitution.replaced.map(symbol => collatedOf.get(symbol.id)!))].sort()
                const key = `${by.join(',')}>${replaced.join(',')}`
                if (!found.has(key)) found.set(key, { replaced, by })
            }
        }
    }
    return [...found.values()].sort((a, b) => compare(a.by[0], b.by[0]))
}

/**
 * Collates the copies all at once. Every reading is compared with every
 * reading of the same meaning on the other copies, and two are taken to
 * be one where they lie within the window of their pair of copies at
 * both ends, the window centred where the pair's drift along the roll
 * puts it (`driftBetween`). The readings are then joined nearest pair first, and never
 * so that one copy would read a joined reading twice.
 *
 * Collating one copy after another against what was collated before, as
 * connecting versions does, depends on the order: six copies collated in
 * their 720 orders give hundreds of different results. Compared all with
 * all, the result is the same whichever order the copies are given in,
 * and only the copies themselves decide it.
 * @category Filiation
 */
export const collateCopies = (edition: Pick<Edition, 'copies'>, copyIds: readonly string[]): CopyCollation => {
    const copies = copyIds.filter(id => edition.copies.some(copy => copy.id === id))
    const order = new Map(copies.map((id, index) => [id, index]))
    const readingsOf = new Map(copies.map(id => [id, readingsOfCopy(edition.copies.find(copy => copy.id === id)!)]))
    const all = [...readingsOf.values()].flat()
    const byKey = groupBy(all, reading => reading.key)
    const drift: Record<string, Drift[]> = {}
    for (let i = 0; i < copies.length; i++) {
        for (let j = i + 1; j < copies.length; j++) {
            const between = driftBetween(readingsOf.get(copies[i])!, readingsOf.get(copies[j])!)
            if (between.length > 0) drift[`${copies[i]}|${copies[j]}`] = between
        }
    }
    const windows = windowsOf(copies, byKey, drift)
    // Readings are compared as far apart as any two copies drift, and the reach of a window beyond that.
    const furthest = Math.max(0, ...Object.values(drift).flat().map(knot => Math.abs(knot.by)))

    const edges: { x: CopyReading, y: CopyReading, d: number }[] = []
    for (const readings of byKey.values()) {
        const sorted = [...readings].sort((a, b) => a.place.from - b.place.from || compare(a.id, b.id))
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length && sorted[j].place.from - sorted[i].place.from <= REACH + furthest; j++) {
                const x = sorted[i]
                const y = sorted[j]
                if (x.copy === y.copy) continue
                const d = distanceIn(windows, drift, order, x, y)
                if (d > 1 + 1e-9) continue
                const [p, q] = x.id < y.id ? [x, y] : [y, x]
                edges.push({ x: p, y: q, d })
            }
        }
    }
    edges.sort((a, b) => a.d - b.d || compare(a.x.id, b.x.id) || compare(a.y.id, b.y.id))

    const readings = clustered(all, edges)
        .map(members => asCollated(members, order))
        .sort((a, b) => a.place.from - b.place.from || compare(a.key, b.key) || compare(a.id, b.id))
    const collatedOf = new Map<string, string>()
    for (const reading of readings) {
        reading.carriers.forEach(feature => collatedOf.set(`${feature}|${reading.key}`, reading.id))
    }

    const extent = Object.fromEntries(copies.map(id => {
        const own = readingsOf.get(id)!
        return [id, {
            from: mm(Math.min(...own.map(reading => reading.place.from))),
            to: mm(Math.max(...own.map(reading => reading.place.from)))
        }]
    }))

    return { copies, readings, windows, drift, recodings: recodingsOf(edition, copies, readingsOf, collatedOf), extent }
}

/** Whether the bar has a word for the meaning at all. */
export const reads = (bar: TrackerBar, meaning: TrackMeaning): boolean => bar.positionOf(meaning) !== undefined
