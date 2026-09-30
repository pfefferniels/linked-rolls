import { v4 } from "uuid";
import { ConditionState } from "./ConditionState.js";
import { AnySymbol } from "./Symbol.js";
import { TrackerBar } from "../systems/TrackerBar.js";
import { defaultTrackerBar, trackerBarOf } from "../systems/index.js";
import { TrackCalibration } from "./TrackCalibration.js";
import { AnyFeature, FeatureOrPatch, HorizontalSpan, Patch } from "./Feature.js";
import { ActorAssignment, assignReference, certaintyOf, DateAssignment, isAsserted, ObjectAssumption, ReferenceAssumption } from "./Assumption.js";
import { WithId, WithType } from "../shared/utils.js";
import { Agent, Concept, Software } from "./Agent.js";
import { FeatureSource } from "./FeatureSource.js";
import { Measure, Millimeters, Percent, Quantity, px, Track, track } from "./Quantity.js";
import { Perforator } from "./Perforator.js";

/**
 * How far the paper has stretched, or shrunk where it is negative, since
 * it was perforated, as a share of its length then: the strain
 * ΔL / L. It is a ratio of two lengths and so has no unit of its own,
 * and it is stated in per cent because what paper does is a matter of
 * tenths of one. It is taken in one direction, along the roll or across
 * it, since machine-made paper does not stretch the same way in both.
 * @see crm:E54 Dimension
 */
export interface Strain extends Measure<'percent'> {
    /**
     * The standard uncertainty of the value, one standard deviation.
     * Left out where the measurement gave none, which leaves it no more
     * precise than paper is known to vary.
     * @see reo:uncertainty
     */
    uncertainty?: Percent
}

/**
 * The paper of the copy stretched or shrunk, as measured on the copy:
 * with a rule against a length the perforator fixed, or across the roll
 * against the pitch of the punch block. What the alignments of the
 * copies say about the paper is worked out from them (`paperOf`) and not
 * stated here, so that a condition stands only where something was
 * measured. A strain along the roll goes into that working out.
 * @see crm:E3 Condition State
 */
export interface PaperStretch extends ConditionState<'paper-stretch'> {
    /**
     * The strain along the roll, the direction the alignment measures.
     * @see reo:strainAlong
     */
    along?: Strain

    /**
     * The strain across the roll. Paper stretches more across than
     * along, so this is no measure of the other.
     * @see reo:strainAcross
     */
    across?: Strain
}

/**
 * A general condition description for a roll copy, e.g.
 * overall wear, discoloration, or other observations.
 * @see crm:E3 Condition State
 */
export interface GeneralRollCondition extends ConditionState<'general'> { }

/**
 * The paper of the copy torn at one place, most often a tear running in
 * from one of its edges. Each tear is a condition of its own, so that
 * each can carry the belief it rests on and serve as a premise. A tear
 * that runs into a chain of holes damages the chain as well, which is
 * then stated of the chain as `partially-torn`.
 * @see crm:E3 Condition State
 */
export interface Tear extends ConditionState<'torn'> {
    /**
     * Where along the roll the tear lies, measured as the copy's
     * features are, so that it moves with them when the copy is aligned.
     * @see reo:horizontal
     */
    horizontal: HorizontalSpan

    /**
     * The edge of the paper the tear runs in from, where it runs in
     * from one.
     * @see reo:edge
     */
    edge?: 'bass' | 'treble'

    /**
     * How far the tear reaches into the paper, taken across the roll
     * from the edge it runs in from.
     * @see reo:depth
     */
    depth?: Measure<'mm'>

    /**
     * IIIF region pointing to a depiction of the tear in the scan.
     * @see crm:P138i has representation
     */
    depiction?: string
}

/**
 * An assignment of a condition (general, paper-stretch or a tear)
 * to a roll copy, annotatable with a belief about its certainty.
 */
export type RollConditionAssignment = ObjectAssumption<GeneralRollCondition | PaperStretch | Tear>

/**
 * The keeper a copy is held by, as an object assumption, so that the
 * statement can carry the belief it rests on and the reasons for it.
 */
export type KeeperAssignment = ObjectAssumption<Agent>

export const rollConditions = [
    'general',
    'paper-stretch',
    'torn'
] as const

/**
 * How far an alignment moves a copy's places before it scales them:
 * along the roll, in the copy's own millimetres, and across it, in
 * tracks.
 */
export interface Shift {
    /** Along the roll. */
    horizontal: Millimeters

    /** Across the tracker bar. */
    vertical: Track
}

/**
 * How the copy's own places are carried onto the edition's axis, which
 * is the millimetres of its reference copy (`Edition.referenceCopy`):
 *
 *     x_axis = (x + shift.horizontal) · scale
 *     track_axis = track + shift.vertical
 *
 * It is found, not given: `alignCopy` matches the copy's notes with the
 * reference copy's and records what it found, and can find it again.
 * The document holds the copy's features and tears at its own places,
 * as they were read, and this beside them; `importJsonLd` puts them
 * onto the axis and `asJsonLd` takes them back, so that within the
 * library every place along the roll is a place on the axis.
 *
 * What the scale is put down to, the paper or the speed the copy was
 * cut for, is worked out from all the alignments together (`paperOf`).
 * Not exported to RDF.
 */
export interface Alignment {
    /**
     * The copy it was found against, by id: the edition's reference
     * copy at the time. Left out by alignments recorded before this was.
     */
    against?: string

    /** Applied before the scale. */
    shift: Shift

    /** Own millimetres to the axis's, applied after the shift. */
    scale: number

    /** How many notes of the copy found their counterpart on the reference copy. */
    matched?: number

    /** How far the counterparts still lie apart, as a root mean square in millimetres of the axis. */
    residual?: Millimeters

    /**
     * The standard error of the scale: the residual over the spread of
     * the matched notes along the roll, as for a line of least squares.
     */
    scaleError?: number

    /** The software that found it, and when. */
    foundBy?: {
        /** The name of the method. */
        software: string
        /** Its revision (`ALIGNMENT_METHOD`). */
        version: string
        /**
         * The day it was found.
         * @format date
         */
        date: Date
    }
}

/**
 * The width and length of a roll copy's paper, as they were measured on
 * it or on its scan.
 * @see crm:E54 Dimension
 */
export interface RollDimensions {
    /**
     * The width of the roll.
     * @see reo:width
     */
    width: Millimeters

    /**
     * The total height (length) of the roll.
     * @see reo:height
     */
    height: Millimeters

    /**
     * The unit of measurement.
     * @see crm:P91 has unit
     */
    unit: 'mm'
}

/** The margins on the treble and bass sides of the roll, in the unit the scan was measured in. */
export interface Margins<U extends 'px' | 'mm'> {
    treble: Quantity<U>
    bass: Quantity<U>
    unit: U
}

/**
 * A paper speed, as a roll's label, its catalogue or its format
 * states it.
 * @see crm:E54 Dimension
 */
export type PaperSpeed = Measure<'ft/min'> | Measure<'m/min'>

/**
 * Describes the production of a roll copy: the manufacturer,
 * the paper used, the date, and the system and paper speed the
 * copy was cut for.
 * @see lrmoo:F32 Item Production Event
 */
export interface ProductionEvent {
    /**
     * The company that produced the roll copy
     * (e.g. "M. Welte & Söhne"). An object assumption, so that a
     * company read off a box label or adopted from a letter can say
     * where it comes from.
     * @see crm:P14 carried out by
     */
    company?: ObjectAssumption<Agent>

    /**
     * The paper the roll copy was cut on. An object assumption, so that
     * what the paper is taken to be can say how that was found and serve
     * as a premise, e.g. of a dating.
     * @see crm:P126 employed
     */
    paper?: ObjectAssumption<Concept>

    /**
     * The date of production, if known.
     * @see crm:P4 has time-span
     */
    date?: DateAssignment

    /**
     * The reproducing system the copy was cut for. Left out, it is
     * the roll's own; a Licensee re-cut of a T-100 roll names the
     * Licensee here. A system the type vocabulary knows carries the
     * IRI of its concept as `id`.
     * @see crm:P32 used general technique
     */
    system?: Concept

    /**
     * The paper speed the copy was cut for. A copy cut from the same
     * master for another speed comes out longer or shorter than the
     * roll it is aligned with by the ratio of the speeds. The alignment
     * measures that ratio far more closely than a label states a speed,
     * so the speed is held against what the alignments give
     * (`alignmentProblems`) rather than used to find it.
     * @see reo:paperSpeed
     */
    speed?: ObjectAssumption<PaperSpeed>

    /**
     * The perforator the copy was punched on, with the drive and the
     * setting its perforations show.
     * @see crm:P16 used specific object
     */
    perforator?: Perforator

    /**
     * The features the copy came from its punching with: the note and
     * expression perforations, and now and then a mark the perforator
     * left. A reading of a scan finds every chain of holes on the paper
     * at once and states it here, and a feature an editor reads as the
     * work of a later hand belongs in the act that made it, whichever
     * kind of feature it is.
     * @see reo:produced
     */
    produced?: AnyFeature[]
}

export const modificationPurposes = [
    'musical-improvement',
    'technical-improvement',
    'repair',
    'labeling',
    'control',
    'dating',
    'glossing'
] as const

/** What a modification of a copy was for, as far as it can be told. */
export type ModificationPurpose = typeof modificationPurposes[number]

/**
 * An identifiable act that changed the roll copy after it was punched.
 * Three kinds of act are told apart, because the CRM tells them apart.
 * E79 Part Addition asks that what is added be "a separate identifiable
 * whole prior to" the act, which a label glued on is and a pencil line
 * is not: drawing, writing and punching bring a feature into being and
 * are productions.
 * @see crm:E79 Part Addition, crm:E80 Part Removal, crm:E12 Production
 */
export type Modification = Partial<{
    /**
     * Who carried out the modification.
     * @see crm:P14 carried out by
     */
    actor: ActorAssignment
    /**
     * When the modification took place.
     * @see crm:P4 has time-span
     */
    date: DateAssignment
}> & ({
    type: 'Attachment',

    /**
     * The patches glued onto the copy, each with whatever it bears.
     * @see crm:P111 added
     */
    added: Patch[],

    /**
     * @see crm:P21 had general purpose
     */
    purpose?: ModificationPurpose

} | {
    type: 'Alteration',

    /**
     * The features the act brought into being: a date written on the
     * paper, a circle in pencil, a hole punched by hand. Any kind of
     * feature may come of a later act, as any kind may come of the
     * punching.
     * @see reo:produced
     */
    produced: AnyFeature[],

    /**
     * @see crm:P21 had general purpose
     */
    purpose?: ModificationPurpose

} | {
    type: 'Removal',

    /**
     * What was taken off the copy, by id. It stood there before the act
     * and is named rather than stated here. Removals are read from what
     * they leave behind, such as a bright spot where a label sat.
     * @see crm:P113 removed
     */
    removed: string[],

    /**
     * @see crm:P21 had general purpose
     */
    purpose?: 'delabeling'
})

/**
 * A physical copy of a roll, held at a specific location. Each roll
 * copy has its own measurements, conditions and modifications, and
 * states its features in the act that brought each of them about.
 * Multiple copies of the same roll may exist across different archives
 * or collections.
 * @see reo:RollCopy
 */
export interface RollCopy extends WithType<'RollCopy'>, WithId {
    /**
     * Physical measurements of this roll copy: its dimensions, hole
     * separation and margins, the resolution of its scan, and how it
     * lies on the edition's axis. What the perforations tell about the
     * machine that cut them is stated with the production.
     *
     * A value the edition exports is an object assumption, so that it
     * can say what took it: a measurement naming the program and its
     * version, the scan or analysis it was taken on, and the day.
     * @see crm:P39i was measured by
     */
    measurements: Partial<{
        /**
         * The physical dimensions of the roll.
         * @see reo:dimensions
         */
        dimensions: ObjectAssumption<RollDimensions>

        /**
         * The distance across the roll from the centre of one track to
         * the next, the track pitch or Teilung, in the unit the scan was
         * measured in. It is fixed by the tracker bar the roll was cut
         * for, and is another thing than the chain pitch, which runs
         * along the roll.
         * @see reo:holeSeparation
         */
        holeSeparation: ObjectAssumption<Measure<'px'> | Measure<'mm'>>

        /**
         * The margins on the treble and bass sides of the roll.
         * Not exported to RDF.
         */
        margins: Margins<'px'> | Margins<'mm'>

        /**
         * How the copy's places are carried onto the edition's axis.
         * Left out for the reference copy, whose places are the axis,
         * and for a copy not aligned yet.
         * Not exported to RDF.
         */
        alignment: Alignment

        /**
         * What a pneumatic reader added to this copy's chains of holes,
         * where it was taken off again. Such a reader reports how long a
         * valve stayed open, which exceeds the perforation that opened it,
         * so its chains are overlong by a constant while its onsets agree.
         * Nothing for a copy read by other means, whose chains are the
         * punched ones themselves.
         * Not exported to RDF.
         */
        readerExtension: {
            /** How much longer the reading of a chain ran than the perforation that caused it. */
            length: Millimeters

            /**
             * The chains it was not taken off, by `@id`, being no longer
             * than it is. The constant reaches its limit there rather
             * than the copy being wrong, and why they were left is for
             * the edition to state about the features themselves; this
             * only records that they stand as the reader gave them, so
             * that putting the extension back does not lengthen a chain
             * nothing was taken from.
             */
            leaving?: string[]
        }

        /**
         * The resolution this copy's scan was read at, along the roll.
         * It is what the measurements given in pixels are to be read
         * against, and what every conversion between a place in the
         * scan and one on the paper goes through. A scanner may read
         * across the roll at another resolution, which the analysis
         * files do not state.
         * @see reo:scanResolution
         */
        scanResolution: ObjectAssumption<Measure<'px/in'>>

        /**
         * Relates this copy's scan to the tracker bar: how the scanning
         * software's hole numbering was shifted onto the bar, and where
         * the track grid sits in the image. Not exported to RDF.
         */
        trackCalibration: TrackCalibration
    }>

    /**
     * The production event that created this roll copy.
     * @see lrmoo:R28i was produced by
     */
    production?: ProductionEvent

    /**
     * Condition assessments of this roll copy (e.g. paper stretch,
     * general wear, a tear). Each condition is an assumption annotatable
     * with a belief.
     * @see crm:P44 has condition
     */
    conditions: RollConditionAssignment[]

    /**
     * A short siglum to identify the copy, e.g. "St1" or "Wi1": letters
     * for the collection the copy was read in, and a number counting the
     * copies of the roll held there. A copy without one is named by its
     * keeper.
     * @see reo:siglum
     */
    siglum?: string

    /**
     * The institution or person holding this copy. Left out where it is
     * not known, as for a copy known only from a recording. An object
     * assumption, so that a keeper read off a file header or adopted
     * from a letter can say where it comes from. Who held the copy
     * before is not stated here: P50 names the current keeper.
     * @see crm:P50 has current keeper
     */
    keeper?: KeeperAssignment

    /**
     * The same copy as others name it: the record its keeper gives it,
     * such as Stanford's PURL for a copy of the Condon collection. It
     * names the copy as the GND names a pianist, and takes over nothing
     * the record says about it; what the edition holds of the copy it
     * states itself.
     * @see owl:sameAs
     */
    sameAs?: string[]

    /**
     * @see crm:P31i was modified by
     */
    modifications: Modification[]

    /**
     * The scan URL or IIIF URL of the roll.
     * @see crm:P138i has representation
     */
    scan?: string

    /**
     * What this copy's features were read from. A copy that states no
     * source is one whose features reached the edition by a way that
     * was not written down.
     * @see reo:capture
     */
    readFrom?: FeatureSource

    /**
     * The versions this copy is held to carry, where its features are not
     * read into symbols, as for a copy known only from a recording. Each
     * statement carries the belief it rests on.
     * @see crm:P128 carries
     */
    carries?: ReferenceAssumption[]
}

/** What an act brought onto the copy: what it produced or glued on, a removal nothing. */
export const featuresMadeBy = (modification: Modification): FeatureOrPatch[] => {
    if (modification.type === 'Alteration') return modification.produced
    return modification.type === 'Attachment' ? modification.added : []
}

/** Whether the act is one that modified the copy, rather than the production that punched it. */
export const isModification = (act: ProductionEvent | Modification): act is Modification => 'type' in act

/** Whether the act is left stating nothing: it produced, added or removed nothing. */
export const statesNothing = (modification: Modification): boolean =>
    modification.type === 'Removal' ? modification.removed.length === 0 : featuresMadeBy(modification).length === 0

/**
 * The features of the copy act by act: what the punching produced
 * first, then what each modification produced or glued on. A feature a
 * patch bears states no place of its own and is not among them;
 * `withBorneFeatures` reaches those.
 */
export const featuresByAct = (copy: Pick<RollCopy, 'production' | 'modifications'>): FeatureOrPatch[][] =>
    [copy.production?.produced ?? [], ...copy.modifications.map(featuresMadeBy)]

/** Every feature the copy states at a place of its own, whichever act made it. */
export const featuresOf = (copy: Pick<RollCopy, 'production' | 'modifications'>): FeatureOrPatch[] =>
    featuresByAct(copy).flat()

/** The measurements of a copy the edition exports, each of which can say what took it. */
const exportedMeasurementsOf = (copy: Pick<RollCopy, 'measurements'>) =>
    [copy.measurements.dimensions, copy.measurements.holeSeparation, copy.measurements.scanResolution]
        .filter(value => value !== undefined)

/** The programs the measurements of a copy name as having taken them, each once, as far as they name any. */
export const measuringSoftwareOf = (copy: Pick<RollCopy, 'measurements'>): Software[] => {
    const named = exportedMeasurementsOf(copy)
        .flatMap(value => value['@annotation']?.belief.reasons ?? [])
        .flatMap(reason => reason.type === 'measurement' ? reason.software ?? [] : [])
    return [...new Map(named.map(software => [`${software.name}\u0000${software.version ?? ''}`, software])).values()]
}

/** Whether the condition is the stretch or shrinkage of the paper, as measured on the copy. */
export const isPaperStretch = (condition: RollConditionAssignment): condition is ObjectAssumption<PaperStretch> =>
    condition.conditionType === 'paper-stretch'

/** What the copy's paper was measured to have done, where anything was measured. */
export const paperStretchOf = (copy: Pick<RollCopy, 'conditions'>): ObjectAssumption<PaperStretch> | undefined =>
    copy.conditions.find(isPaperStretch)

/** Whether the condition is a tear in the paper. */
export const isTear = (condition: RollConditionAssignment): condition is ObjectAssumption<Tear> =>
    condition.conditionType === 'torn'

/** The tears the copy is stated to have. */
export const tearsOf = (copy: Pick<RollCopy, 'conditions'>): ObjectAssumption<Tear>[] =>
    copy.conditions.filter(isTear)

/**
 * The bar a copy is read by, which is the one it was cut for. A copy
 * that names no system falls back to `defaultTrackerBar`.
 */
export const barOf = (copy: Pick<RollCopy, 'production'>): TrackerBar =>
    trackerBarOf(copy.production?.system) ?? defaultTrackerBar

/** The diameter of the punch the copy was cut with, where the edition holds it true or likely. */
export const punchDiameterOf = (copy: Pick<RollCopy, 'production'>): Millimeters | undefined => {
    const diameter = copy.production?.perforator?.condition?.punchDiameter
    return diameter && isAsserted(certaintyOf(diameter)) ? diameter.value : undefined
}

/**
 * Reads the features of a copy as the tracker bar would read them.
 * Chains of holes on a position the bar does not read carry no symbol
 * and are dropped, which is what happens physically as well.
 *
 * The bar is named rather than defaulted: a copy is read by its own
 * bar, and reading a green copy with the red one is a silent semitone.
 *
 * Reading stops where the bar says the roll's content ends. What a
 * scanner punched past the rewind is not the roll speaking: Julian
 * Dyer's scan of the green 225 carries a staircase of test punches
 * across nearly every track after its rewind, which read on as symbols
 * would be 318 notes nobody played. The features stay on the copy,
 * since they are really on the paper and are his calibration of his own
 * scan; it is the reading that stops.
 */
export function asSymbols(
    features: readonly FeatureOrPatch[],
    bar: TrackerBar
): AnySymbol[] {
    const chains = features.filter(feature => feature.type === 'HoleChain')
    const end = bar.endsAt(chains)

    return chains
        .filter(feature => end === undefined || feature.horizontal.from <= end.at)
        // An opening across two positions uncovers both bar holes and so
        // reads as both commands; one on a single position gives the one.
        .flatMap((feature): AnySymbol[] =>
            bar.meaningsOf(feature.vertical).map(meaning => ({
                id: `symbol_${v4()}`,
                ...meaning,
                carriers: [assignReference(feature.id)]
            })))
}

/**
 * The tracks a copy carries holes on that the tracker bar does not read.
 * A non-empty result usually means the scan is calibrated wrongly. A chain
 * lying across several positions is counted against each one the bar
 * cannot read, and not at all where it reads them all.
 */
export function unreadTracks(
    features: readonly FeatureOrPatch[],
    bar: TrackerBar
): Map<Track, number> {
    const counts = new Map<Track, number>()
    features
        .filter(feature => feature.type === 'HoleChain')
        .flatMap(feature => bar.positionsIn(feature.vertical))
        .filter(position => !bar.meaningOf(position))
        .forEach(position => counts.set(position, (counts.get(position) || 0) + 1))
    return counts
}

/**
 * Falls back to the way the scan geometry was reconstructed before the
 * calibration was recorded: the bass hard margin stood in for the phase
 * of the tracker grid, with a constant making up most of the difference.
 *
 * The constant of one and a half tracks is the one the facsimile tiles
 * were laid out with, and on the rolls measured so far it comes within
 * about a quarter of a track. It is kept for copies imported before the
 * calibration was written down; anything read since carries its own.
 */
export const calibrationOf = (copy: RollCopy): TrackCalibration | undefined => {
    if (copy.measurements.trackCalibration) {
        return copy.measurements.trackCalibration
    }

    const { holeSeparation, margins } = copy.measurements
    if (holeSeparation?.unit !== 'px' || margins?.unit !== 'px') return undefined

    return {
        unit: 'px',
        offset: px(margins.bass + 1.5 * holeSeparation.value),
        separation: holeSeparation.value,
        shift: track(0)
    }
}

