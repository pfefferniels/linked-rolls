import { v4 } from "uuid"
import { Belief } from "./Assumption.js"
import { admits, BothEnds, CollationTolerance, Displacement, offsetEndOf, offsetStartOf } from "./Collation.js"
import { EditionView } from "./EditionView.js"
import { FeatureOrPatch } from "./Feature.js"
import { mean, Millimeters, mm } from "./Quantity.js"
import {
    excessKurtosisOf, Histogram, histogramOf, normalQuantile, Spread, spreadOf, standardise, Tail, tailOf
} from "./statistics.js"
import { AnySymbol } from "./Symbol.js"
import { groupBy } from "./utils.js"
import { deletedBy, insertedBy, Version } from "./Version.js"

/**
 * How far the copies of a roll disagree about where a symbol lies, and
 * the collation tolerance that follows from it.
 *
 * The tolerance decides what counts as a reading at all, and a number
 * someone picks decides it by fiat. The disagreement between copies is
 * measurable, and in the material examined so far it is close to
 * normal, so a displacement an editor put there is recognisable as a
 * departure from that curve rather than as a value above a guess. What
 * the measurement yields is a screen: it says which readings the curve
 * does not account for, and an editor says which of those are acts.
 */

/** Where one copy puts a symbol, against where the copies read with it put it. */
export interface Reading {
    symbol: Readonly<AnySymbol>

    /** The copies under test less the rest, at either end of the symbol. */
    displacement: Displacement
}

const placeOf = (carriers: readonly Readonly<FeatureOrPatch>[]): BothEnds<Millimeters> => ({
    from: mean(carriers.map(carrier => carrier.horizontal.from)),
    to: mean(carriers.map(carrier => carrier.horizontal.to))
})

const sitsOn = (view: EditionView, copies: ReadonlySet<string>) => (feature: Readonly<FeatureOrPatch>): boolean => {
    const copy = view.copyOf(feature.id)
    return copy !== undefined && copies.has(copy.id)
}

/**
 * How far the named copies put each of the symbols from where the
 * remaining copies put it.
 *
 * The comparison is between copies and not between two texts, because
 * a collated symbol is one symbol carrying the features of every copy
 * that reads it: no second symbol is left to match it against. Which
 * copies a version was established from is therefore not something the
 * edition still states once the collation has run, and the caller
 * names them. `sidesOf` says which copies attest each side of a
 * derivation, which is the way to name them rather than by hand.
 *
 * The copies named are one **side** of a comparison and the rest are
 * the other, so the displacement is signed and its sign is the caller's
 * choice. Naming a set that is not a side yields a well formed
 * measurement of something else: one copy's own noise against a mixture
 * of both sides, which is no window any collation used and is wider
 * than the truth.
 *
 * A symbol only one side carries measures nothing and is passed over,
 * which leaves out exactly the insertions and the deletions.
 */
export const readingsOf = (
    view: EditionView,
    symbols: readonly Readonly<AnySymbol>[],
    copies: ReadonlySet<string>
): Reading[] => {
    const tested = sitsOn(view, copies)

    return symbols.flatMap((symbol): Reading[] => {
        const carriers = view.carriersOf(symbol)
        const here = carriers.filter(tested)
        const there = carriers.filter(carrier => !tested(carrier))
        if (here.length === 0 || there.length === 0) return []

        const ours = placeOf(here)
        const theirs = placeOf(there)
        return [{ symbol, displacement: { from: mm(ours.from - theirs.from), to: mm(ours.to - theirs.to) } }]
    })
}

/**
 * What sample a reading belongs to. Notes and expressions are taken
 * apart by default, since in the present material they scatter
 * differently.
 *
 * That split is a stopgap and no distinction in the model. What it
 * stands in for is a skew: the offset between two copies runs across
 * the width of the paper, and the expression punches sit at the two
 * margins, where the gradient is largest and of opposite sign, while
 * the notes sit between them. Grouped by where the punch sits rather
 * than by what it says, the expression punches are no noisier than the
 * notes. Once the alignment carries a skew term, one sample will do,
 * which is why this is a parameter of the estimator and not a field
 * anywhere.
 */
export type Grouping = (symbol: Readonly<AnySymbol>) => string

const byWhatItIs: Grouping = symbol => symbol.type

export interface ScatterOptions {
    /** What sample a reading belongs to. By default what the symbol is: a note, an expression, a text. */
    groupOf?: Grouping

    /** The width of the histogram's bins. */
    binWidth?: Millimeters

    /** The tolerance the edition states at present, against which each departure is reported as still admitted or not. */
    stated?: CollationTolerance
}

/** A reading the calculated tolerance does not admit. */
export interface Departure {
    /** The symbol read. */
    symbol: string

    /** How far the copies under test put it from where the rest put it. */
    displacement: Displacement

    /** That displacement in units of the scatter, at either end. */
    z: BothEnds<number>

    /**
     * Which end put the reading outside the window. At least one is
     * true, and a reading far out at both is true twice.
     *
     * It is worth seeing apart. The onset, with the kind, decides
     * whether two copies read one command; the end decides whether that
     * command was lengthened or shortened. A separation the end alone
     * makes is as often a punch measured badly as a punch genuinely
     * prolonged, and an editor cannot tell the two apart without being
     * told which test did it.
     */
    separatedBy: BothEnds<boolean>

    /**
     * Whether the tolerance the edition states at present still admits
     * it. Absent where none was given to compare against.
     *
     * This sees one direction only. A departure is by definition a
     * reading the calculated window rejects, so this says which of
     * those the stated window joined and which would therefore be taken
     * apart. It cannot show the converse, a reading the stated window
     * rejects and the calculated one would join, because such a reading
     * is no departure and never reaches this list. `changesBetween`
     * reports both, and the ones it adds are the silent ones.
     */
    admittedAsStated?: boolean
}

/** How far a sample departs from the normal shape the tolerance assumes of it. */
export interface Normality {
    /** How much heavier its tails are than a normal sample's. Nothing for a normal shape. */
    excessKurtosis: number

    /** What it puts beyond two, three and four times the scatter, against what a normal sample would. */
    tails: Tail[]
}

/** A histogram with the curve its counts are held to follow. */
export interface FittedHistogram extends Histogram<'mm'> {
    /**
     * The normal curve, in the counts' own units, so that an overlay is
     * drawn from these numbers rather than fitted a second time:
     * `area / (sigma * sqrt(2 * PI)) * exp(-(((x - centre) / sigma) ** 2) / 2)`.
     */
    curve: { centre: Millimeters, sigma: Millimeters, area: number }
}

/** How far one sample of readings scatters, and the tolerance that follows from it. */
export interface Scatter {
    /** The sample, as the grouping named it. */
    group: string

    /** Where the readings sit and how far they scatter, at either end. */
    spread: BothEnds<Spread<'mm'>>

    /**
     * How many times the scatter a reading must lie out before it is
     * taken for a departure rather than for chance. It is fixed by the
     * size of the sample and not at a round three, so that fewer than
     * one of the sample's own readings is expected to pass it.
     */
    k: number

    /**
     * The window that follows: `k` times the scatter, centred on the
     * median. Its offsets run in the direction of the sample, the
     * copies named less the rest, so a window measured over the
     * parent's copies carries them negated. `toleranceAcross` is what
     * turns these into the window a derivation stores, and it asks
     * which side was named; storing one of these directly does not.
     */
    tolerance: CollationTolerance

    /** How far the sample departs from the normal shape, at either end. */
    normality: BothEnds<Normality>

    /** The sample as counts per bin, with the curve to draw over it. */
    histogram: BothEnds<FittedHistogram>

    /** The readings the calculated tolerance does not admit, the furthest out first. */
    departures: Departure[]
}

/** The distances from the centre a sample's normality is read at. */
const TAILS = [2, 3, 4]

const DEFAULT_BIN_WIDTH = mm(0.25)

/**
 * How far out a reading must lie before it is held a departure: the
 * point beyond which fewer than one reading of a sample of this size is
 * expected to fall by chance. For the samples an edge of the stemma
 * yields, some hundreds of readings, this lands between 3.0 and 3.2.
 */
export const departureThreshold = (n: number): number => normalQuantile(1 - 1 / (2 * n))

interface Estimate {
    spread: Spread<'mm'>
    standardised: number[]
    normality: Normality
    histogram: FittedHistogram
}

const estimate = (values: readonly Millimeters[], binWidth: Millimeters): Estimate | undefined => {
    const spread = spreadOf(values)
    const histogram = histogramOf(values, binWidth)
    if (!spread || !histogram || spread.sigma === 0) return undefined

    const standardised = values.map(value => standardise(value, spread))
    return {
        spread,
        standardised,
        normality: {
            excessKurtosis: excessKurtosisOf(standardised),
            tails: TAILS.map(beyond => tailOf(standardised, beyond))
        },
        histogram: {
            ...histogram,
            curve: { centre: spread.median, sigma: spread.sigma, area: spread.n * binWidth }
        }
    }
}

const furthestOut = (departure: Departure): number => Math.max(Math.abs(departure.z.from), Math.abs(departure.z.to))

const departuresIn = (
    sample: readonly Reading[],
    standardised: BothEnds<readonly number[]>,
    k: number,
    stated: CollationTolerance | undefined
): Departure[] =>
    sample
        .map((reading, i): Departure => {
            const z = { from: standardised.from[i], to: standardised.to[i] }
            return {
                symbol: reading.symbol.id,
                displacement: reading.displacement,
                z,
                separatedBy: { from: Math.abs(z.from) > k, to: Math.abs(z.to) > k },
                ...(stated && { admittedAsStated: admits(stated, reading.displacement) })
            }
        })
        .filter(departure => furthestOut(departure) > k)
        .sort((a, b) => furthestOut(b) - furthestOut(a))

const scatterIn = (
    group: string,
    sample: readonly Reading[],
    { binWidth = DEFAULT_BIN_WIDTH, stated }: ScatterOptions
): Scatter[] => {
    const from = estimate(sample.map(reading => reading.displacement.from), binWidth)
    const to = estimate(sample.map(reading => reading.displacement.to), binWidth)
    if (!from || !to) return []

    const k = departureThreshold(sample.length)
    return [{
        group,
        spread: { from: from.spread, to: to.spread },
        k,
        tolerance: {
            offsetStart: from.spread.median,
            offsetEnd: to.spread.median,
            toleranceStart: mm(k * from.spread.sigma),
            toleranceEnd: mm(k * to.spread.sigma)
        },
        normality: { from: from.normality, to: to.normality },
        histogram: { from: from.histogram, to: to.histogram },
        departures: departuresIn(sample, { from: from.standardised, to: to.standardised }, k, stated)
    }]
}

/**
 * How the readings scatter, one sample per group. A group whose
 * readings all sit at one place yields nothing, since no scatter can be
 * read off such a sample.
 */
export const scatterOf = (readings: readonly Reading[], options: ScatterOptions = {}): Scatter[] =>
    [...groupBy(readings, reading => (options.groupOf ?? byWhatItIs)(reading.symbol))]
        .flatMap(([group, sample]) => scatterIn(group, sample, options))

/** How one copy's readings of a version's text scatter against the readings of the copies it is collated with. */
export const scatterOfCopy = (
    view: EditionView,
    versionId: string,
    copyId: string,
    options: ScatterOptions = {}
): Scatter[] =>
    scatterOf(readingsOf(view, view.snapshot(versionId), new Set([copyId])), options)

interface Window {
    offset: Millimeters
    tolerance: Millimeters
}

const covering = (windows: readonly Window[]): Window => {
    const lowest = Math.min(...windows.map(window => window.offset - window.tolerance))
    const highest = Math.max(...windows.map(window => window.offset + window.tolerance))
    return { offset: mm((lowest + highest) / 2), tolerance: mm((highest - lowest) / 2) }
}

/**
 * Which side of a derivation a measurement was taken over: the version
 * derived, or the version it is read against.
 */
export type Side = 'child' | 'parent'

/**
 * One window admitting what every sample's own window admits, in the
 * direction a collation applies it.
 *
 * A derivation states a single tolerance while the samples differ, and
 * covering them keeps each sample within the budget of chance
 * departures its own threshold was chosen for.
 *
 * `named` says whose copies the scatters were measured over, and it is
 * asked for rather than assumed because nothing else can tell. A window
 * measured over the parent's copies runs the other way, and stored
 * unturned its offsets sit on the wrong side of the readings: the width
 * is unaffected, so nothing in the magnitude looks wrong, and the
 * departures are unaffected too, since they are taken about the
 * sample's own median. Only the collation is wrong, and it is wrong in
 * both directions at once, separating readings that belong together and
 * merging readings that do not. Nothing where there is no sample.
 *
 * Covering has a cost where the samples sit at different centres, and
 * it falls on the sample that does not move. One window has one centre,
 * so where one sample's window contains another's the covering window
 * is simply the wider one, centred where that sample sits, and the
 * narrower sample is then judged against an offset it does not have.
 * On the Phillips edge of welte225.org the expression punches sit
 * 1.2 mm from the notes and the notes' onsets agree exactly, so the
 * covering window shifts every note onset by a displacement only the
 * expressions show. `changesBetween` makes that visible as readings the
 * window moves; it is the price of one tolerance per derivation, and it
 * is the same skew the grouping stands in for.
 */
export const toleranceAcross = (
    scatters: readonly Scatter[],
    named: Side
): CollationTolerance | undefined => {
    if (scatters.length === 0) return undefined

    const towardsChild = named === 'child' ? 1 : -1
    const start = covering(scatters.map(({ tolerance }) =>
        ({ offset: offsetStartOf(tolerance), tolerance: tolerance.toleranceStart })))
    const end = covering(scatters.map(({ tolerance }) =>
        ({ offset: offsetEndOf(tolerance), tolerance: tolerance.toleranceEnd })))

    return {
        offsetStart: mm(towardsChild * start.offset),
        toleranceStart: start.tolerance,
        offsetEnd: mm(towardsChild * end.offset),
        toleranceEnd: end.tolerance
    }
}

/** What putting one window in force in place of another would do to a collation. */
export interface Changes {
    /** Readings the window in force joins and the proposed one would take apart. */
    separated: Reading[]

    /** Readings the window in force takes apart and the proposed one would join. */
    merged: Reading[]
}

/**
 * Which readings two windows disagree about, taken apart by the
 * direction they disagree in.
 *
 * The two are worth seeing separately because they do not cost the
 * same. A separation leaves a visible edit in the apparatus that a
 * reader can challenge; a merge erases a reading and says nothing, and
 * the edition has no way to show what it lost. So the merges are the
 * list to read first, and an edge that only separates is the safer kind
 * of change however many readings it touches.
 *
 * This is what to ask before applying a calculated window, rather than
 * reading `admittedAsStated` off the departures, which sees separations
 * only. An edge both windows agree about throughout needs no
 * re-collation at all, and its tolerance may simply be stated.
 */
export const changesBetween = (
    readings: readonly Reading[],
    inForce: CollationTolerance,
    proposed: CollationTolerance
): Changes => ({
    separated: readings.filter(({ displacement }) =>
        admits(inForce, displacement) && !admits(proposed, displacement)),
    merged: readings.filter(({ displacement }) =>
        !admits(inForce, displacement) && admits(proposed, displacement))
})

/** How many of a side's symbols a copy bears. */
export interface Attestation {
    copy: string
    symbols: number
}

/** The copies attesting each side of a derivation, each side in order of how much it bears. */
export interface Sides {
    /** The copies bearing what the child inserts: the reading the derivation moves to. */
    child: Attestation[]

    /** The copies bearing what the child strikes from the parent: the reading it moves from. */
    parent: Attestation[]
}

const copiesBearing = (view: EditionView, symbols: readonly Readonly<AnySymbol>[]): Attestation[] => {
    const tally = symbols.reduce((counts, symbol) => {
        const bearers = new Set(view.carriersOf(symbol).flatMap(carrier => {
            const copy = view.copyOf(carrier.id)
            return copy ? [copy.id] : []
        }))
        bearers.forEach(copy => counts.set(copy, (counts.get(copy) ?? 0) + 1))
        return counts
    }, new Map<string, number>())

    return [...tally]
        .map(([copy, symbols]) => ({ copy, symbols }))
        .sort((a, b) => b.symbols - a.symbols)
}

/**
 * Which copies attest each side of a version's derivation, read off the
 * edits themselves: the copies bearing what it inserts stand for the
 * reading it moves to, and those bearing what it strikes for the
 * reading it moves from.
 *
 * This is the way to name a side. Counting only the copies that bear a
 * version's own text will not do it, because a collation hands a
 * child's carriers up to the parent's symbols, so a descendant's copies
 * come to bear an ancestor's readings and look like its own. The
 * deletions are not exposed to that: what a version strikes is attested
 * by the copies that read it before the version departed from it.
 *
 * A fully collated edge inserts and deletes nothing and so attests
 * neither side, which is the case where the edition has genuinely
 * stopped saying and an editor has to.
 */
export const sidesOf = (view: EditionView, versionId: string): Sides | undefined => {
    const version = view.get<Version>(versionId)
    if (!version) return undefined

    return {
        child: copiesBearing(view, insertedBy(version)),
        parent: copiesBearing(view, view.getAll<AnySymbol>(deletedBy(version)))
    }
}

const inMillimetres = (value: Millimeters): string => `${value.toFixed(2)} mm`

const sampleDescribed = (scatter: Scatter): string =>
    `${scatter.group}: ${scatter.spread.from.n} readings, scattering by `
    + `${inMillimetres(scatter.spread.from.sigma)} at the start and ${inMillimetres(scatter.spread.to.sigma)} at the end `
    + `about a median of ${inMillimetres(scatter.spread.from.median)} and ${inMillimetres(scatter.spread.to.median)}, `
    + `with a threshold of ${scatter.k.toFixed(2)} times the scatter`

const warrantFor = (scatters: readonly Scatter[]): string =>
    'The tolerance is calculated from the scatter of the readings themselves, taken as the median absolute '
    + 'deviation of how far the collated copies put each symbol from where the copies read with it put it. '
    + `${scatters.map(sampleDescribed).join('. ')}. `
    + 'Each threshold is the point beyond which fewer than one reading of a sample of that size is expected to '
    + 'fall by chance, and the window is the threshold times the scatter about its median.'

/**
 * The belief a calculated tolerance rests on, to annotate the
 * derivation's `collationTolerance` with: an inference from the scatter
 * of the readings, the size of the sample and the rule that fixed the
 * threshold. `used` names what the inference worked on, such as the
 * copies compared.
 *
 * It is held likely rather than true. The tolerance follows from the
 * sample only as far as the sample is normal, and a sample far from
 * that shape makes the number unreliable rather than wrong, which is
 * what `normality` is reported for.
 */
export const inferredTolerance = (scatters: readonly Scatter[], used: readonly string[] = []): Belief => ({
    type: 'belief',
    id: v4(),
    certainty: 'likely',
    reasons: [{
        type: 'inference',
        premises: [],
        ...(used.length > 0 && { used: [...used] }),
        note: warrantFor(scatters)
    }]
})
