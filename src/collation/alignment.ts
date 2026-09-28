import { FeatureOrPatch } from "../model/Feature.js";
import { Alignment, featuresOf, isTear, RollCopy, tearsOf } from "../model/RollCopy.js";
import { TrackerBar } from "../systems/TrackerBar.js";
import { defaultTrackerBar } from "../systems/index.js";
import { add, Millimeters, mm, Quantity, subtract, Track, track, Unit } from "../model/Quantity.js";
import { partitionPoint } from "../shared/sorted.js";

type Ends<U extends Unit> = { from: Quantity<U>, to?: Quantity<U> }

/** A place on the copy's own paper, on the edition's axis. */
export const toAxis = (alignment: Alignment | undefined) => (place: Millimeters): Millimeters =>
    alignment ? mm((place + alignment.shift.horizontal) * alignment.scale) : place

/** A place on the edition's axis, on the copy's own paper. */
export const fromAxis = (alignment: Alignment | undefined) => (place: Millimeters): Millimeters =>
    alignment ? mm(place / alignment.scale - alignment.shift.horizontal) : place

const acrossToAxis = (alignment: Alignment | undefined) => (position: Track): Track =>
    alignment ? track(position + alignment.shift.vertical) : position

const acrossFromAxis = (alignment: Alignment | undefined) => (position: Track): Track =>
    alignment ? track(position - alignment.shift.vertical) : position

/** Both ends of a span taken through the mapping, the far end only where the span has one. */
const mapped = <U extends Unit>(span: Ends<U>, through: (at: Quantity<U>) => Quantity<U>) => {
    span.from = through(span.from)
    if (span.to !== undefined) span.to = through(span.to)
}

/**
 * Where along the roll the copy states anything: its features, and its
 * tears, which are measured as the features are. A tear states no track,
 * so the shift across the roll leaves it where it is.
 */
const spansAlong = (copy: RollCopy) =>
    [...featuresOf(copy), ...tearsOf(copy)].map(placed => placed.horizontal)

/** Puts the copy's own places onto the axis in place. */
const moveOnto = (alignment: Alignment, copy: RollCopy) => {
    spansAlong(copy).forEach(span => mapped(span, toAxis(alignment)))
    featuresOf(copy).forEach(feature => mapped(feature.vertical, acrossToAxis(alignment)))
}

/** Takes the copy's places on the axis back to its own paper in place. */
const moveOff = (alignment: Alignment, copy: RollCopy) => {
    spansAlong(copy).forEach(span => mapped(span, fromAxis(alignment)))
    featuresOf(copy).forEach(feature => mapped(feature.vertical, acrossFromAxis(alignment)))
}

/**
 * Carries the copy's features and tears from its own places onto the
 * axis, and records how, in place of any alignment it had: that one is
 * taken off first.
 */
export const applyAlignment = (alignment: Alignment, copy: RollCopy) => {
    revertAlignment(copy)
    moveOnto(alignment, copy)
    copy.measurements.alignment = alignment
}

/** Takes the copy's features and tears back to its own places, as far as it was aligned. */
export const revertAlignment = (copy: RollCopy) => {
    const alignment = copy.measurements.alignment
    if (!alignment) return

    moveOff(alignment, copy)
    delete copy.measurements.alignment
}

/**
 * Places are written to the nanometre. Carried onto the axis and back,
 * a place comes back a rounding error away from where it was, and a
 * document saved again would change in its last digits every time.
 * A scan resolves a tenth of a millimetre at best.
 */
const PLACES_PER_MM = 1e6

const written = (place: Millimeters): Millimeters => mm(Math.round(place * PLACES_PER_MM) / PLACES_PER_MM)

/**
 * The copy with its features and tears at its own places, as a document
 * holds them, and its alignment kept to say how they go onto the axis.
 * The copy given is left as it is. A copy that is not aligned is the
 * very same copy.
 */
export const atOwnPlaces = (copy: RollCopy): RollCopy => {
    const alignment = copy.measurements.alignment
    if (!alignment) return copy

    const along = (place: Millimeters) => written(fromAxis(alignment)(place))
    const across = acrossFromAxis(alignment)
    const ownSpan = <U extends Unit, S extends Ends<U>>(span: S, through: (at: Quantity<U>) => Quantity<U>): S => {
        const own = { ...span }
        mapped(own, through)
        return own
    }
    const ownFeature = <F extends FeatureOrPatch>(feature: F): F =>
        ({ ...feature, horizontal: ownSpan(feature.horizontal, along), vertical: ownSpan(feature.vertical, across) })

    return {
        ...copy,
        ...(copy.production && {
            production: {
                ...copy.production,
                ...(copy.production.produced && { produced: copy.production.produced.map(ownFeature) })
            }
        }),
        modifications: copy.modifications.map(act => {
            if (act.type === 'Alteration') return { ...act, produced: act.produced.map(ownFeature) }
            if (act.type === 'Attachment') return { ...act, added: act.added.map(ownFeature) }
            return act
        }),
        conditions: copy.conditions.map(condition => isTear(condition)
            ? { ...condition, horizontal: ownSpan(condition.horizontal, along) }
            : condition)
    }
}

/**
 * Puts the features and tears of a copy read from a document, which
 * holds them at the copy's own places, onto the axis. The copy given is
 * changed.
 */
export const putOnAxis = (copy: RollCopy) => {
    const alignment = copy.measurements.alignment
    if (alignment) moveOnto(alignment, copy)
}

/** The copy's features at its own places, as it was read, whatever alignment it has. */
export const ownFeaturesOf = (copy: RollCopy): FeatureOrPatch[] => {
    const alignment = copy.measurements.alignment
    if (!alignment) return featuresOf(copy)

    return featuresOf(copy).map(feature => {
        const own = { ...feature, horizontal: { ...feature.horizontal }, vertical: { ...feature.vertical } }
        mapped(own.horizontal, fromAxis(alignment))
        mapped(own.vertical, acrossFromAxis(alignment))
        return own
    })
}

const chainsOf = (copy: RollCopy) => featuresOf(copy).filter(feature => feature.type === 'HoleChain')

/**
 * The reader's extension as it lies on the axis. It is a length on the
 * copy's own paper, which the alignment scales like any other.
 */
const extensionOnAxis = (extension: Millimeters, copy: RollCopy): Millimeters =>
    mm(extension * (copy.measurements.alignment?.scale ?? 1))

/**
 * Takes the extension a pneumatic reader adds off the ends of the
 * copy's chains of holes, and records how much was taken.
 *
 * Such a reader reports how long a valve stayed open, and a valve is
 * held on past the perforation that opened it, so its chains run longer
 * than the punched ones while their onsets agree. Left in, the
 * difference is not a difference between copies at all: a collation
 * comparing this copy's chain ends against a scanned copy's compares a
 * pneumatic on-time with a punched slot, and reads the one as a
 * lengthening of the other.
 *
 * The extension is a property of the reader rather than of the roll,
 * and on the material measured so far it is a constant: it does not
 * grow with the length of the perforation, there is no shortest
 * on-time the valve cannot fall below, and it does not run along the
 * roll with the paper speed as far as one roll can show. What it does
 * vary with is the port that read it, by about half a millimetre either
 * way and without any gradient across the bar, which is measured but
 * too coarse to model from one roll.
 *
 * Only chains of holes are touched. What a writing or a mark spans is no valve.
 */
/**
 * The chains the extension cannot be taken off, being no longer than it
 * is: the reader reported them open for less time than it holds a valve
 * on beyond the perforation, so the constant over-corrects them and
 * would leave them ending before they begin.
 *
 * They are where the constant shows its limit rather than where the
 * copy is wrong, the extension varying by about half a millimetre with
 * the port. What to do with them is an editorial question — a condition
 * on the feature, a reading of the chain, a smaller extension — and
 * `shortenChains` throws rather than answer it.
 */
export const tooShortToShorten = (
    extension: Millimeters,
    copy: RollCopy,
    leaving: ReadonlySet<string> = new Set()
): Readonly<FeatureOrPatch>[] => {
    const onAxis = extensionOnAxis(extension, copy)
    return chainsOf(copy).filter(chain =>
        !leaving.has(chain.id) && chain.horizontal.to - chain.horizontal.from <= onAxis)
}

/**
 * Takes the extension off, leaving the named chains as the reader gave
 * them. Naming a chain is an editorial act and not a repair: it says
 * this one is where the constant stops applying, and the edition is
 * what has to say why. The copy records which were left, so that
 * putting the extension back does not lengthen a chain nothing was
 * taken from.
 *
 * Throws where a chain that was not named is no longer than the
 * extension, `tooShortToShorten` saying beforehand which those are.
 */
export const shortenChains = (
    extension: Millimeters,
    copy: RollCopy,
    leaving: ReadonlySet<string> = new Set()
) => {
    if (copy.measurements.readerExtension) return

    const tooShort = tooShortToShorten(extension, copy, leaving)
    if (tooShort.length > 0) {
        throw new Error(
            `The extension of ${extension} mm cannot be taken off ${tooShort.length} `
            + `chain(s) of holes of copy ${copy.id}, which are no longer than it: `
            + `${tooShort.map(chain => chain.id).join(', ')}`)
    }

    const onAxis = extensionOnAxis(extension, copy)
    const left = chainsOf(copy).filter(chain => leaving.has(chain.id)).map(chain => chain.id)
    chainsOf(copy)
        .filter(chain => !leaving.has(chain.id))
        .forEach(chain => { chain.horizontal.to = subtract(chain.horizontal.to, onAxis) })

    copy.measurements.readerExtension = { length: extension, ...(left.length > 0 && { leaving: left }) }
}

/** Puts the reader's extension back on the chains it was taken off, as far as one was taken off. */
export const revertShortening = (copy: RollCopy) => {
    const taken = copy.measurements.readerExtension
    if (taken === undefined) return

    const onAxis = extensionOnAxis(taken.length, copy)
    const left = new Set(taken.leaving ?? [])
    chainsOf(copy)
        .filter(chain => !left.has(chain.id))
        .forEach(chain => { chain.horizontal.to = add(chain.horizontal.to, onAxis) })

    delete copy.measurements.readerExtension
}

/**
 * The method `alignFeatures` follows, as an alignment records it. Its
 * revision changes when the method does and at no other release, so
 * that an alignment found by an earlier method can be told from one
 * that would be found again as it stands.
 */
export const ALIGNMENT_METHOD = { software: 'linked-rolls alignFeatures', version: '1' } as const

/**
 * How a copy's places are carried onto another copy's:
 * `x_other = (x + shift) · scale`.
 */
export interface AlignmentResult {
    /** Applied before the scale. */
    shift: Millimeters
    scale: number
    /** The notes of the copy that found their counterpart on the other. */
    matched: number
    /** How far the counterparts still lie apart, as a root mean square in the other copy's millimetres. */
    residual: Millimeters
    /**
     * The standard error of the scale, as for a line of least squares
     * through the matches: the residual over the spread of the matched
     * notes along the copy, and over the root of their number. The
     * robust line is fitted otherwise, but on Welte 225 this comes
     * within a few per cent of what resampling the matches gives.
     */
    scaleError: number
}

/** A note the bar reads: its pitch and where along the roll its chain of holes begins. */
interface Onset {
    readonly pitch: number
    readonly at: Millimeters
}

/** A place on each roll that shows the same note. */
interface Match {
    readonly a: Millimeters
    readonly b: Millimeters
}

/** The line `b = slope · a + intercept`. */
interface Line {
    readonly slope: number
    readonly intercept: number
}

const byPlace = (x: Onset, y: Onset): number => x.at - y.at || x.pitch - y.pitch

/** The notes the bar reads off the features, in the order they pass it. */
const noteOnsets = (features: readonly FeatureOrPatch[], bar: TrackerBar): Onset[] =>
    features
        .flatMap((feature): Onset[] => {
            if (feature.type !== 'HoleChain') return []
            return bar.meaningsOf(feature.vertical)
                .filter(meaning => meaning.type === 'note')
                .map(meaning => ({ pitch: meaning.pitch, at: feature.horizontal.from }))
        })
        .sort(byPlace)

/**
 * The middle one of the values, the upper of the two where their number
 * is even. It is selected rather than the values sorted (Hoare's FIND,
 * as Wirth writes it): a long roll gives over a million slopes, and only
 * the one in the middle is wanted. The values are reordered where they
 * lie.
 */
const median = (values: Float64Array): number => {
    const middle = values.length >> 1
    let low = 0
    let high = values.length - 1
    while (low < high) {
        const pivot = values[middle]
        let i = low
        let j = high
        while (i <= j) {
            while (values[i] < pivot) i++
            while (pivot < values[j]) j--
            if (i <= j) {
                const swapped = values[i]
                values[i] = values[j]
                values[j] = swapped
                i++
                j--
            }
        }
        if (j < middle) low = i
        if (middle < i) high = j
    }
    return values[middle] ?? 0
}

/** Matches beyond this are thinned before the slopes are taken, whose number grows with the square. */
const SLOPE_SAMPLE = 1500

/**
 * The line of the median slope and the median intercept, after Theil
 * and Sen. A minority of matches at odds with the rest, as from a
 * passage the copy retimes or from an anchor set by chance, leaves it
 * unmoved, where a least-squares line would tilt towards them.
 */
const robustLine = (matches: readonly Match[]): Line | undefined => {
    const step = Math.max(1, Math.ceil(matches.length / SLOPE_SAMPLE))
    const sample = matches.filter((_, i) => i % step === 0)
    const slopes = new Float64Array(sample.length * (sample.length - 1) / 2)
    let count = 0
    sample.forEach((m, i) => {
        for (let j = i + 1; j < sample.length; j++) {
            const n = sample[j]
            // Two matches at one place on the copy give no slope.
            if (n.a !== m.a) slopes[count++] = (n.b - m.b) / (n.a - m.a)
        }
    })
    if (count === 0) return undefined
    const slope = median(slopes.subarray(0, count))
    return { slope, intercept: median(Float64Array.from(matches, m => m.b - slope * m.a)) }
}

const placed = (line: Line, a: number): number => line.slope * a + line.intercept

const residualOf = (line: Line, match: Match): number => match.b - placed(line, match.a)

/** Pitches in a row that pin down a place on a roll, provided the row occurs once. */
const ANCHOR_LENGTH = 6

/** Every run of `length` pitches, keyed by the run, with the onsets it starts at. */
const runsOf = (onsets: readonly Onset[], length: number): Map<string, Onset[]> =>
    Map.groupBy(onsets.slice(0, Math.max(0, onsets.length - length + 1)), (_, i) =>
        onsets.slice(i, i + length).map(onset => onset.pitch).join(','))

/** The places a run of pitches found once on each roll ties together. */
const anchors = (a: readonly Onset[], b: readonly Onset[]): Match[] => {
    const runsB = runsOf(b, ANCHOR_LENGTH)
    return [...runsOf(a, ANCHOR_LENGTH)]
        .flatMap(([key, starts]): Match[] => {
            const others = runsB.get(key)
            return starts.length === 1 && others?.length === 1
                ? [{ a: starts[0].at, b: others[0].at }]
                : []
        })
}

interface Candidate {
    readonly distance: number
    readonly a: Onset
    readonly b: Onset
}

/** Takes the candidates nearest first, each onset going into one pair only. */
const pairedNearestFirst = (candidates: readonly Candidate[]): Match[] => {
    const taken = new Set<Onset>()
    const matches: Match[] = []
    for (const candidate of [...candidates].sort((x, y) => x.distance - y.distance)) {
        if (taken.has(candidate.a) || taken.has(candidate.b)) continue
        taken.add(candidate.a)
        taken.add(candidate.b)
        matches.push({ a: candidate.a.at, b: candidate.b.at })
    }
    return matches
}

/** The onsets of B by pitch, each pitch in the order its onsets pass the bar. */
type ByPitch = ReadonlyMap<number, readonly Onset[]>

/** Widens the window by a hair before it is searched, so that rounding in its bounds cannot leave out what the distance admits. */
const WINDOW_SLACK = 1e-9

/** Each onset of A paired with the nearest onset of B of its pitch within the window around where the line puts it. */
const nearestMatches = (a: readonly Onset[], b: ByPitch, line: Line, window: number): Match[] => {
    const candidates = a.flatMap(onset => {
        const expected = placed(line, onset.at)
        const ofPitch = b.get(onset.pitch) ?? []
        const first = partitionPoint(ofPitch, other => other.at < expected - window - WINDOW_SLACK)
        const end = partitionPoint(ofPitch, other => other.at <= expected + window + WINDOW_SLACK)
        return ofPitch.slice(first, end)
            .map(other => ({ distance: Math.abs(other.at - expected), a: onset, b: other }))
            .filter(candidate => candidate.distance <= window)
    })
    return pairedNearestFirst(candidates)
}

/**
 * Windows, in the other roll's millimetres, narrowed as the line settles.
 * The first is wide enough to catch what a line extrapolated from the
 * anchors misses at the ends of a long roll; the last is narrow enough
 * to leave out a passage the copy retimed.
 */
const WINDOWS: readonly Millimeters[] = [mm(40), mm(15), mm(6)]

interface Fit {
    readonly line: Line
    readonly matches: readonly Match[]
}

const settled = (a: readonly Onset[], b: ByPitch) => (fit: Fit, window: Millimeters): Fit => {
    const matches = nearestMatches(a, b, fit.line, window)
    return { line: robustLine(matches) ?? fit.line, matches }
}

/** How far the places of the matches on the copy spread, as a standard deviation. */
const spreadOf = (matches: readonly Match[]): number => {
    const centre = matches.reduce((total, m) => total + m.a, 0) / matches.length
    return Math.sqrt(matches.reduce((total, m) => total + (m.a - centre) ** 2, 0) / matches.length)
}

const resultOf = ({ line, matches }: Fit): AlignmentResult | undefined => {
    if (matches.length < 2 || line.slope <= 0) return undefined
    const squares = matches.reduce((total, m) => total + residualOf(line, m) ** 2, 0)
    const residual = Math.sqrt(squares / matches.length)
    const spread = spreadOf(matches)
    return {
        shift: mm(line.intercept / line.slope),
        scale: line.slope,
        matched: matches.length,
        residual: mm(residual),
        scaleError: spread > 0 ? residual / (spread * Math.sqrt(matches.length)) : Infinity
    }
}

/**
 * Finds the shift and scale that carry the places of `rollA` onto those
 * of `rollB`, reading each through its own bar. Runs of pitches that
 * occur once on each roll anchor a first line; then every note is paired
 * with its nearest counterpart of the same pitch and the line refitted,
 * the window closing each time. A copy cut for another paper speed, a
 * scan with a calibration pattern, and holes the other copy lacks are
 * all within reach of that. Nothing is found where the rolls share no
 * run of pitches, as between two different pieces.
 *
 * Two bars are what lets a copy cut for one system be aligned against a
 * copy cut for another, a T-98 against a T-100: the bars put the note
 * positions on different tracks, but they agree on the pitch each track
 * sounds, and it is the pitches that are matched. Where a copy's holes
 * have already been put onto the edition's bar, that bar reads it.
 */
export function alignFeatures(
    rollA: readonly FeatureOrPatch[],
    rollB: readonly FeatureOrPatch[],
    barA: TrackerBar = defaultTrackerBar,
    barB: TrackerBar = barA
): AlignmentResult | undefined {
    const a = noteOnsets(rollA, barA)
    const b = noteOnsets(rollB, barB)
    const coarse = robustLine(anchors(a, b))
    if (!coarse) return undefined
    return resultOf(WINDOWS.reduce(settled(a, Map.groupBy(b, onset => onset.pitch)), { line: coarse, matches: [] }))
}
