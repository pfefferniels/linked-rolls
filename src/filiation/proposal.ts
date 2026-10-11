/**
 * A stemma proposed from the copies alone: which versions there are,
 * lost ones included, how they derive from each other, and which
 * readings each inserts and deletes.
 */
import { Edition } from "../model/Edition.js"
import { barOf, RollCopy } from "../model/RollCopy.js"
import { AnySymbol } from "../model/Symbol.js"
import { idOf } from "../model/Assumption.js"
import { editsOf, insertedBy } from "../model/Version.js"
import { Millimeters, mm } from "../model/Quantity.js"
import { keyOf } from "../systems/TrackerBar.js"
import { isCollationsOwn } from "../collation/Collation.js"
import { versionsWitnessedBy } from "../analysis/witnesses.js"
import { collateCopies, CopyCollation, CollatedReading, Recoding, reads } from "./readings.js"
import { defaultMargin, presenceIn, PresenceMatrix } from "./presence.js"
import { Costs, defaultCosts, LaidOut, Scored, searchStemmata, statesOf, Support } from "./search.js"
import { barNamed, transfersOf } from "./systems.js"
import { MAX_COPIES } from "./trees.js"

/**
 * How near a reading of the same kind on the other side of the root
 * makes a reading on the less refined side a moved one, where nothing
 * else is said. Hits up to about this distance are more than chance; a
 * wider window agrees with the edition of WM 225 more often, but largely
 * by convention.
 * @category Filiation
 */
export const defaultMovedWithin = mm(25)

/**
 * What a proposal is computed with. Every value has a default, the one
 * the edition of WM 225 is reproduced with.
 * @category Filiation
 */
export interface FiliationOptions {
    /** The copies whose features are collated; by default every copy with features of its punching. */
    copies?: readonly string[]

    /** What the search counts against a stemma (`defaultCosts`). */
    costs?: Partial<Costs>

    /**
     * How near a reading of the same kind on the other side of the root
     * makes a reading on the less refined side a moved one (`defaultMovedWithin`).
     */
    movedWithin?: Millimeters

    /** How far beyond its text, or the edge of a tear, a copy cannot say what it lacks (3 mm). */
    margin?: Millimeters

    /** Whether the edits the editor wrote hold their versions to what they insert and delete (yes). */
    pin?: boolean

    /** How many runners-up to report (5). */
    alternatives?: number
}

/**
 * A version the proposal posits.
 * @category Filiation
 */
export interface ProposedVersion {
    /** A name within the proposal: the versions are numbered from the root down. */
    id: string

    /** The copy carrying the version at first hand; none for a lost state. */
    copy?: string

    /** The system the version is coded for, by its identifier. */
    system: string

    /** The version it derives from, by its name within the proposal. */
    parent?: string

    /** The version of the edition it stands for, where one does. */
    version?: string

    /** The collated readings the version inserts. */
    inserts: string[]

    /** The collated readings the version deletes. */
    deletes: string[]

    /** The held commands that stand for a latched pair, among what the version inserts and deletes. */
    recodings: Recoding[]

    /** The readings the version holds that the copy carrying it lacks. */
    deviations: string[]

    /** The edits the editor wrote on `version` that the proposal keeps as they are. */
    pinned: string[]
}

/**
 * Why an edit the editor wrote is not kept.
 * @category Filiation
 */
export type Unpinned = {
    edit: string
    version: string
    reason: 'version-gone' | 'reading-gone' | 'contradicts-copies'
}

/**
 * A stemma proposed from the copies, with what it rests on: the
 * collation, the presence of every reading in every copy, the cost of
 * the best stemma and of the runners-up, and the margin by which the
 * copies decide each of its groupings.
 * @category Filiation
 */
export interface StemmaProposal {
    copies: string[]
    costs: Costs
    movedWithin: Millimeters
    margin: Millimeters
    collation: CopyCollation
    matrix: PresenceMatrix
    /** From the root down. */
    versions: ProposedVersion[]
    /** The stemma in the notation `Scored` uses, the copies by siglum. */
    notation: string
    cost: number
    /** How many admissible stemmata were scored. */
    scored: number
    alternatives: Scored[]
    supports: Support[]
    /** The readings the stemma lets arise more than once, with the versions inserting them. */
    conflicts: { reading: string, versions: string[] }[]
    /** The readings on the less refined side of the root taken for the base text, as moved or cleaned up by the other side. */
    baseText: string[]
    /** By collated reading, the symbol of the edition it stands for, where one does. */
    symbols: Record<string, string>
    unpinned: Unpinned[]
}

/** The copies with features of their own punching, in the order the edition lists them. */
const transcribed = (edition: Pick<Edition, 'copies'>): string[] =>
    edition.copies
        .filter(copy => (copy.production?.produced ?? []).some(feature => feature.type === 'HoleChain'))
        .map(copy => copy.id)

const keyOfSymbol = (symbol: AnySymbol): string | undefined => symbol.type === 'text' ? undefined : keyOf(symbol)

/**
 * By collated reading, the symbol of the edition it stands for: the one
 * of the same meaning sharing most of its carriers, each symbol given to
 * one reading at most. A reading whose carriers grew or shrank keeps the
 * symbol's name, so that a collation repeated does not rename what it
 * finds again.
 */
const symbolsFor = (edition: Edition, readings: readonly CollatedReading[]): Record<string, string> => {
    const byCarrier = new Map<string, CollatedReading[]>()
    for (const reading of readings) {
        for (const carrier of reading.carriers) byCarrier.set(carrier, [...(byCarrier.get(carrier) ?? []), reading])
    }
    const candidates: { symbol: string, reading: string, shared: number, exact: boolean, order: number }[] = []
    let order = 0
    for (const version of edition.versions) {
        for (const symbol of insertedBy(version)) {
            order++
            const key = keyOfSymbol(symbol)
            if (!key) continue
            const carriers = symbol.carriers.map(idOf)
            const counts = new Map<CollatedReading, number>()
            for (const carrier of carriers) {
                for (const reading of byCarrier.get(carrier) ?? []) {
                    if (reading.key === key) counts.set(reading, (counts.get(reading) ?? 0) + 1)
                }
            }
            for (const [reading, shared] of counts) {
                const exact = shared === carriers.length && shared === reading.carriers.length
                candidates.push({ symbol: symbol.id, reading: reading.id, shared, exact, order })
            }
        }
    }
    candidates.sort((a, b) =>
        Number(b.exact) - Number(a.exact) || b.shared - a.shared || a.order - b.order || (a.reading < b.reading ? -1 : 1))
    const symbols: Record<string, string> = {}
    const taken = new Set<string>()
    for (const { symbol, reading } of candidates) {
        if (taken.has(symbol) || symbols[reading]) continue
        symbols[reading] = symbol
        taken.add(symbol)
    }
    return symbols
}

/** A placement of every reading: which nodes hold it. */
type Placement = Map<string, boolean[]>

const childrenOf = (tree: LaidOut): number[][] => {
    const children = Array.from({ length: tree.copy.length }, () => [] as number[])
    tree.parent.forEach((parent, child) => { if (parent >= 0) children[parent].push(child) })
    return children
}

/** The nodes from the root down, each before the nodes derived from it. */
const fromRoot = (tree: LaidOut): number[] => {
    const children = childrenOf(tree)
    const order: number[] = []
    const visit = (v: number) => {
        order.push(v)
        children[v].forEach(visit)
    }
    visit(tree.copy.length - 1)
    return order
}

const inserting = (tree: LaidOut, states: readonly boolean[], v: number): boolean =>
    states[v] && (tree.parent[v] < 0 || !states[tree.parent[v]])

const deleting = (tree: LaidOut, states: readonly boolean[], v: number): boolean =>
    !states[v] && tree.parent[v] >= 0 && states[tree.parent[v]]

/**
 * The readings on the less refined side of the root that the other side
 * moved or cleaned up, rather than that this side added.
 *
 * Where the root has two branches, presence alone cannot tell a reading
 * one branch added from a reading of the base text the other changed.
 * Refinement orients the root: the branch whose copies carry fewer
 * dynamic perforations is the earlier text. A reading only that branch
 * carries is then taken for the base text where the other branch carries
 * a reading of the same kind within the window and this branch does not
 * (moved), or where it is ineffective (cleaned up, as redundancies are).
 */
const baseTextOf = (
    tree: LaidOut,
    readings: readonly CollatedReading[],
    matrix: PresenceMatrix,
    placement: Placement,
    held: ReadonlySet<string>,
    within: Millimeters,
    systems: readonly string[]
): string[] => {
    const root = tree.copy.length - 1
    const children = childrenOf(tree)[root]
    if (tree.copy[root] >= 0 || children.length !== 2) return []

    const copiesBelow = (v: number) => matrix.copies.filter((_, c) => tree.below[v] & (1 << c))
    const rootSystem = tree.system[root]
    /** How many dynamic perforations the copies of the root's system below the node carry, on average. */
    const densityOf = (v: number): number => {
        const copies = matrix.copies.filter((_, c) => (tree.below[v] & (1 << c)) && systems[c] === rootSystem)
        if (copies.length === 0) return Infinity
        const counts = copies.map(copy => readings.filter(reading =>
            reading.meaning.type === 'expression' && matrix.presence[reading.id][copy] === 'present').length)
        return counts.reduce((sum, count) => sum + count, 0) / counts.length
    }
    const [one, other] = children
    const [side, refined] = densityOf(one) < densityOf(other) ? [one, other] : densityOf(other) < densityOf(one) ? [other, one] : [-1, -1]
    if (side < 0) return []

    const sideCopies = copiesBelow(side)
    const refinedCopies = copiesBelow(refined)
    const redundant = new Set(matrix.redundant)
    const byKey = new Map<string, CollatedReading[]>()
    for (const reading of readings) byKey.set(reading.key, [...(byKey.get(reading.key) ?? []), reading])

    const moved: string[] = []
    for (const reading of readings) {
        if (held.has(reading.id)) continue
        const states = placement.get(reading.id)!
        if (!inserting(tree, states, side)) continue
        const near = (byKey.get(reading.key) ?? []).some(other => other.id !== reading.id
            && Math.abs(other.place.from - reading.place.from) <= within
            && refinedCopies.some(copy => matrix.presence[other.id][copy] === 'present')
            && !sideCopies.some(copy => matrix.presence[other.id][copy] === 'present'))
        if (!near && !redundant.has(reading.id)) continue
        states[root] = true
        moved.push(reading.id)
    }
    return moved
}

/**
 * Where a version is coded for a system whose bar has no word for a
 * reading it inherits, the reading does not go on: the re-cut deletes
 * it, and what stands for it there is a reading of its own.
 */
const recode = (tree: LaidOut, readings: readonly CollatedReading[], placement: Placement) => {
    const order = fromRoot(tree)
    for (const reading of readings) {
        const states = placement.get(reading.id)!
        for (const v of order) {
            const bar = barNamed(tree.system[v])
            if (states[v] && bar && !reads(bar, reading.meaning)) states[v] = false
        }
    }
}

/**
 * Proposes a stemma from the copies.
 *
 * The copies are collated all at once (`collateCopies`), and every
 * reading becomes a character that each copy has, lacks or cannot speak
 * to (`presenceIn`). Every stemma of the copies that the systems admit,
 * up to seven copies, is scored by what it has to let arise and be lost
 * (`Costs`), and the least costly is taken, ties going to fewer lost
 * states. On it, each reading arises in the latest version all copies
 * carrying it descend from, and is deleted where a branch lacks it. A
 * reading only the less refined side of the root carries is taken for
 * the base text where the other side has it moved or cleaned up.
 *
 * Where the edition has versions already, a version of the proposal
 * that a copy carries at first hand stands for the version that copy
 * carries in the edition, and a lost one for the version inserting most
 * of the same readings. An edit the editor wrote on such a version, one
 * a collation would not have written, holds the version to what it
 * inserts and deletes, unless the copies cannot be read so.
 * @category Filiation
 */
export const proposeStemma = (edition: Edition, options: FiliationOptions = {}): StemmaProposal => {
    const copies = transcribed(edition).filter(id => !options.copies || options.copies.includes(id))
    if (copies.length < 2) throw new Error('A stemma needs at least two copies with features')
    if (copies.length > MAX_COPIES) throw new Error(`The exhaustive search covers at most ${MAX_COPIES} copies`)

    const costs: Costs = { ...defaultCosts, ...options.costs }
    const movedWithin = options.movedWithin ?? defaultMovedWithin
    const margin = options.margin ?? defaultMargin
    const copyOf = new Map(edition.copies.map(copy => [copy.id, copy]))
    const names = copies.map(id => copyOf.get(id)!.siglum ?? id)
    const systems = copies.map(id => barOf(copyOf.get(id) as RollCopy).id)
    const transfers = transfersOf()

    const collation = collateCopies(edition, copies)
    const matrix = presenceIn(edition, collation, margin)
    const redundant = new Set(matrix.redundant)
    const rows = collation.readings.map(reading => ({
        presence: copies.map(copy => matrix.presence[reading.id][copy]),
        redundant: redundant.has(reading.id)
    }))
    const search = searchStemmata(copies, names, systems, rows, costs, transfers, options.alternatives ?? 5)
    const tree = search.best
    const size = tree.copy.length

    const place = (fixed: ReadonlyMap<string, ReadonlyMap<number, boolean>>): { placement: Placement, failed: Set<string> } => {
        const placement: Placement = new Map()
        const failed = new Set<string>()
        collation.readings.forEach((reading, index) => {
            const pinned = fixed.get(reading.id)
            let states = statesOf(tree, rows[index].presence, rows[index].redundant, costs, pinned)
            if (!states) {
                failed.add(reading.id)
                states = statesOf(tree, rows[index].presence, rows[index].redundant, costs)!
            }
            placement.set(reading.id, states)
        })
        return { placement, failed }
    }

    const symbols = symbolsFor(edition, collation.readings)
    const readingOf = new Map(Object.entries(symbols).map(([reading, symbol]) => [symbol, reading]))

    // A first placement, free of the editor's edits, tells which version a lost node stands for.
    const free = place(new Map())
    recode(tree, collation.readings, free.placement)
    const standsFor = new Map<number, string>()
    const claimed = new Set<string>()
    for (let v = 0; v < size; v++) {
        const copy = tree.copy[v]
        if (copy < 0) continue
        const firstHand = versionsWitnessedBy(edition, copies[copy])
            .find(witness => witness.by === 'carriers' && witness.through === undefined)
        if (firstHand && !claimed.has(firstHand.version)) {
            standsFor.set(v, firstHand.version)
            claimed.add(firstHand.version)
        }
    }
    const insertsAt = (placement: Placement, v: number) =>
        collation.readings.filter(reading => inserting(tree, placement.get(reading.id)!, v)).map(reading => symbols[reading.id] ?? reading.id)
    const lostMatches: { v: number, version: string, overlap: number }[] = []
    for (let v = 0; v < size; v++) {
        if (tree.copy[v] >= 0) continue
        const proposed = new Set(insertsAt(free.placement, v))
        for (const version of edition.versions) {
            if (claimed.has(version.id)) continue
            const stated = insertedBy(version).map(symbol => symbol.id)
            const shared = stated.filter(id => proposed.has(id)).length
            const union = new Set([...stated, ...proposed]).size
            if (shared > 0) lostMatches.push({ v, version: version.id, overlap: shared / union })
        }
    }
    lostMatches.sort((a, b) => b.overlap - a.overlap || a.v - b.v)
    for (const { v, version } of lostMatches) {
        if (standsFor.has(v) || claimed.has(version)) continue
        standsFor.set(v, version)
        claimed.add(version)
    }

    // The editor's edits hold their versions, as far as the copies allow.
    const unpinned: Unpinned[] = []
    const pins = new Map<number, { edit: string, readings: string[] }[]>()
    const fixed = new Map<string, Map<number, boolean>>()
    const nodeOf = new Map([...standsFor].map(([v, version]) => [version, v]))
    const meaningOf = new Map(collation.readings.map(reading => [reading.id, reading.meaning]))
    if (options.pin !== false) {
        for (const version of edition.versions) {
            const established = editsOf(version).filter(edit => !isCollationsOwn(edit))
            const v = nodeOf.get(version.id)
            for (const edit of established) {
                if (v === undefined) {
                    unpinned.push({ edit: edit.id, version: version.id, reason: 'version-gone' })
                    continue
                }
                const inserted = (edit.insert ?? []).map(symbol => readingOf.get(symbol.id))
                const deleted = (edit.delete ?? []).map(id => readingOf.get(id))
                if ([...inserted, ...deleted].some(reading => reading === undefined)) {
                    unpinned.push({ edit: edit.id, version: version.id, reason: 'reading-gone' })
                    continue
                }
                const bar = barNamed(tree.system[v])
                const hold = (reading: string, node: number, state: boolean) => {
                    const states = fixed.get(reading) ?? new Map<number, boolean>()
                    states.set(node, state)
                    fixed.set(reading, states)
                }
                for (const reading of inserted as string[]) {
                    if (bar && !reads(bar, meaningOf.get(reading)!)) continue
                    hold(reading, v, true)
                    if (tree.parent[v] >= 0) hold(reading, tree.parent[v], false)
                }
                for (const reading of deleted as string[]) {
                    if (bar && !reads(bar, meaningOf.get(reading)!)) continue
                    hold(reading, v, false)
                    if (tree.parent[v] >= 0) hold(reading, tree.parent[v], true)
                }
                pins.set(v, [...(pins.get(v) ?? []), { edit: edit.id, readings: [...inserted, ...deleted] as string[] }])
            }
        }
    }

    const { placement, failed } = place(fixed)
    const held = new Set([...fixed.keys()].filter(reading => !failed.has(reading)))
    const baseText = baseTextOf(tree, collation.readings, matrix, placement, held, movedWithin, systems)
    recode(tree, collation.readings, placement)

    for (const [v, edits] of pins) {
        for (const { edit, readings } of edits) {
            if (readings.some(reading => failed.has(reading))) {
                unpinned.push({ edit, version: standsFor.get(v)!, reason: 'contradicts-copies' })
            }
        }
    }
    const released = new Set(unpinned.map(({ edit }) => edit))

    // Pre-order numbering, so that the root is p0.
    const order = fromRoot(tree)
    const nameOf = new Map(order.map((v, index) => [v, `p${index}`]))
    const versions = order.map((v): ProposedVersion => {
        const inserts = collation.readings.filter(reading => inserting(tree, placement.get(reading.id)!, v)).map(reading => reading.id)
        const deletes = collation.readings.filter(reading => deleting(tree, placement.get(reading.id)!, v)).map(reading => reading.id)
        const inserted = new Set(inserts)
        const deleted = new Set(deletes)
        const used = new Set<string>()
        const recodings = tree.parent[v] >= 0 && tree.transfer[v]
            ? collation.recodings.filter(recoding => {
                const fits = recoding.by.every(id => inserted.has(id) && !used.has(id))
                    && recoding.replaced.every(id => deleted.has(id) && !used.has(id))
                if (fits) [...recoding.by, ...recoding.replaced].forEach(id => used.add(id))
                return fits
            })
            : []
        const copy = tree.copy[v]
        const inner = copy >= 0 && tree.below[v] !== 1 << copy
        const deviations = inner
            ? collation.readings.filter(reading => placement.get(reading.id)![v] && matrix.presence[reading.id][copies[copy]] === 'absent').map(reading => reading.id)
            : []
        return {
            id: nameOf.get(v)!,
            ...(copy >= 0 && { copy: copies[copy] }),
            system: tree.system[v],
            ...(tree.parent[v] >= 0 && { parent: nameOf.get(tree.parent[v]) }),
            ...(standsFor.has(v) && { version: standsFor.get(v) }),
            inserts,
            deletes,
            recodings,
            deviations,
            pinned: (pins.get(v) ?? []).map(({ edit }) => edit).filter(edit => !released.has(edit))
        }
    })

    const conflicts = collation.readings
        .map(reading => ({ reading: reading.id, versions: versions.filter(version => version.inserts.includes(reading.id)).map(version => version.id) }))
        .filter(({ versions }) => versions.length > 1)

    return {
        copies,
        costs,
        movedWithin,
        margin,
        collation,
        matrix,
        versions,
        notation: tree.notation,
        cost: search.cost,
        scored: search.scored,
        alternatives: search.alternatives,
        supports: search.supports,
        conflicts,
        baseText,
        symbols,
        unpinned
    }
}
