import { AnyFeature } from "./Feature";
import { RollCopy, Shift } from "./RollCopy";
import { TrackerBar } from "./TrackerBar";
import { welteT100 } from "./systems/welteT100/bar";
import { add, Millimeters, mm, Quantity, scale, Unit } from "./Quantity";

type Ends<U extends Unit> = { from: Quantity<U>, to?: Quantity<U> }

/** Moves both ends of a span, the far end only where the span has one. */
const move = <U extends Unit>(span: Ends<U>, by: Quantity<NoInfer<U>>) => {
    span.from = add(span.from, by)
    if (span.to !== undefined) span.to = add(span.to, by)
}

/** Stretches both ends of a span away from the beginning of the roll. */
const stretch = <U extends Unit>(span: Ends<U>, factor: number) => {
    span.from = scale(span.from, factor)
    if (span.to !== undefined) span.to = scale(span.to, factor)
}

const back = (shift: Shift): Shift =>
    ({ horizontal: scale(shift.horizontal, -1), vertical: scale(shift.vertical, -1) })

export const applyShift = (shift: Shift, copy: RollCopy) => {
    if (copy.ops.includes('shifted')) return

    copy.features.forEach(feature => {
        move(feature.horizontal, shift.horizontal)
        move(feature.vertical, shift.vertical)
    })
    copy.ops = [...copy.ops, 'shifted']
    copy.measurements.shift = shift
}

/** Scales the copy's features away from the beginning of the roll, and records the factor. */
export const applyScale = (factor: number, copy: RollCopy) => {
    if (copy.ops.includes('stretched')) return

    copy.features.forEach(feature => stretch(feature.horizontal, factor))
    copy.ops = [...copy.ops, 'stretched']
    copy.measurements.scale = factor
}

/** Takes the shift off the copy's features again, as far as one was applied. */
export const revertShift = (copy: RollCopy) => {
    const shift = copy.measurements.shift
    if (!copy.ops.includes('shifted') || !shift) return

    const reversed = back(shift)
    copy.features.forEach(feature => {
        move(feature.horizontal, reversed.horizontal)
        move(feature.vertical, reversed.vertical)
    })
    copy.ops = copy.ops.filter(op => op !== 'shifted')
    delete copy.measurements.shift
}

/** Takes the scale off the copy's features again, as far as one was applied. */
export const revertScale = (copy: RollCopy) => {
    const factor = copy.measurements.scale
    if (!copy.ops.includes('stretched') || factor === undefined) return

    copy.features.forEach(feature => stretch(feature.horizontal, 1 / factor))
    copy.ops = copy.ops.filter(op => op !== 'stretched')
    delete copy.measurements.scale
}

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
}

/** A note the bar reads: its pitch and where along the roll its hole begins. */
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
const noteOnsets = (features: readonly AnyFeature[], bar: TrackerBar): Onset[] =>
    features
        .flatMap((feature): Onset[] => {
            if (feature.type !== 'Hole') return []
            return bar.meaningsOf(feature.vertical)
                .filter(meaning => meaning.type === 'note')
                .map(meaning => ({ pitch: meaning.pitch, at: feature.horizontal.from }))
        })
        .sort(byPlace)

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((x, y) => x - y)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** The slope of the line through two matches, or nothing where they share a place on the copy. */
const slopeBetween = (m: Match, n: Match): number[] =>
    n.a === m.a ? [] : [(n.b - m.b) / (n.a - m.a)]

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
    const slopes = sample.flatMap((m, i) => sample.slice(i + 1).flatMap(n => slopeBetween(m, n)))
    if (slopes.length === 0) return undefined
    const slope = median(slopes)
    return { slope, intercept: median(matches.map(m => m.b - slope * m.a)) }
}

const placed = (line: Line, a: number): number => line.slope * a + line.intercept

const residualOf = (line: Line, match: Match): number => match.b - placed(line, match.a)

/** Pitches in a row that pin down a place on a roll, provided the row occurs once. */
const ANCHOR_LENGTH = 6

/** Every run of `length` pitches, keyed by the run, with the onsets it starts at. */
const runsOf = (onsets: readonly Onset[], length: number): Map<string, Onset[]> => {
    const runs = new Map<string, Onset[]>()
    onsets.slice(0, Math.max(0, onsets.length - length + 1)).forEach((start, i) => {
        const key = onsets.slice(i, i + length).map(onset => onset.pitch).join(',')
        runs.set(key, [...(runs.get(key) ?? []), start])
    })
    return runs
}

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

/** Each onset of A paired with the nearest onset of B of its pitch within the window around where the line puts it. */
const nearestMatches = (a: readonly Onset[], b: readonly Onset[], line: Line, window: number): Match[] => {
    const bByPitch = new Map<number, Onset[]>()
    b.forEach(onset => bByPitch.set(onset.pitch, [...(bByPitch.get(onset.pitch) ?? []), onset]))

    const candidates = a.flatMap(onset => {
        const expected = placed(line, onset.at)
        return (bByPitch.get(onset.pitch) ?? [])
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

const settled = (a: readonly Onset[], b: readonly Onset[]) => (fit: Fit, window: Millimeters): Fit => {
    const matches = nearestMatches(a, b, fit.line, window)
    return { line: robustLine(matches) ?? fit.line, matches }
}

const resultOf = ({ line, matches }: Fit): AlignmentResult | undefined => {
    if (matches.length < 2 || line.slope <= 0) return undefined
    const squares = matches.reduce((total, m) => total + residualOf(line, m) ** 2, 0)
    return {
        shift: mm(line.intercept / line.slope),
        scale: line.slope,
        matched: matches.length,
        residual: mm(Math.sqrt(squares / matches.length))
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
    rollA: readonly AnyFeature[],
    rollB: readonly AnyFeature[],
    barA: TrackerBar = welteT100,
    barB: TrackerBar = barA
): AlignmentResult | undefined {
    const a = noteOnsets(rollA, barA)
    const b = noteOnsets(rollB, barB)
    const coarse = robustLine(anchors(a, b))
    if (!coarse) return undefined
    return resultOf(WINDOWS.reduce(settled(a, b), { line: coarse, matches: [] }))
}
