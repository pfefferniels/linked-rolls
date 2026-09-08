import { v4 } from "uuid";
import { ConditionState } from "./ConditionState";
import { AnySymbol } from "./Symbol";
import { TrackerBar } from "./TrackerBar";
import { welteT100 } from "./systems/welteT100/bar";
import { TrackCalibration } from "./TrackCalibration";
import { AnyFeature } from "./Feature";
import { ActorAssignment, assignReference, DateAssignment, ObjectAssumption } from "./Assumption";
import { WithId, WithType } from "./utils";
import { Agent, Concept } from "./Agent";
import { FeatureSource } from "./FeatureSource";
import { Measure, Millimeters, Quantity, px, Track, track } from "./Quantity";

/**
 * This condition state is used to describe the roll's
 * paper shrinkage or stretching. It might be calculated
 * on the basis of comparing the vertical or horizontal
 * extent with other witnesses of the same roll.
 */
export interface PaperStretch extends ConditionState<'paper-stretch'> {
    /**
     * The stretch factor, e.g. 1.02 means the paper has
     * stretched by 2% compared to its original dimensions.
     * @see rdf:value
     */
    factor: number
}

/**
 * A general condition description for a roll copy, e.g.
 * overall wear, discoloration, or other observations.
 * @see crm:E3 Condition State
 */
export interface GeneralRollCondition extends ConditionState<'general'> { }

/**
 * An assignment of a condition (general or paper-stretch)
 * to a roll copy, annotatable with a belief about its certainty.
 */
export type RollConditionAssignment = ObjectAssumption<GeneralRollCondition | PaperStretch>

export const rollConditions = [
    'general',
    'paper-stretch'
] as const

/**
 * A shift correction applied to a roll copy to align it
 * with other copies. The shift is defined as horizontal
 * (along the roll length, in mm) and vertical (across tracks).
 */
export interface Shift {
    /** Along the roll. */
    horizontal: Millimeters

    /** Across the tracker bar. */
    vertical: Track
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
 * What the scale an alignment found is put down to: the paper of the
 * copy having stretched or shrunk, or the copy having been cut for
 * another paper speed than the roll it is aligned with.
 */
export type ScaleReading =
    | { cause: 'paper', condition: ObjectAssumption<PaperStretch> }
    | { cause: 'speed', speed: ObjectAssumption<PaperSpeed> }

/**
 * Describes the production of a roll copy: the manufacturer,
 * the paper used, the date, and the system and paper speed the
 * copy was cut for.
 * @see lrmoo:F32 Item Production Event
 */
export interface ProductionEvent {
    /**
     * The company that produced the roll copy
     * (e.g. "M. Welte & Söhne").
     * @see crm:P14 carried out by
     */
    company?: Agent

    /**
     * The paper the roll copy was cut on.
     * @see crm:P126 employed
     */
    paper?: Concept

    /**
     * The date of production, if known.
     * @see dcterms:date
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
     * roll it is aligned with by the ratio of the speeds, which is
     * what the alignment then measures.
     * @see reo:paperSpeed
     */
    speed?: ObjectAssumption<PaperSpeed>
}

/**
 * This type denotes identifiable activities that modified
 * the roll copy after its production, e.g. annotations, repairs,
 * etc.
 * @see crm:E79 Part Addition, crm:E80 Part Removal
 */
export type Modification = Partial<{
    /**
     * Who carried out the modification.
     * @see crm:P14 carried out by
     */
    actor: ActorAssignment
    /**
     * When the modification took place.
     * @see dcterms:date
     */
    date: DateAssignment
}> & ({
    type: 'Addition',

    /**
     * @see crm:P111 added
     */
    added: string[],

    /**
     * @see crm:P21 had general purpose
     */
    purpose:
    'musical-improvement' |
    'technical-improvement' |
    'repair' |
    'labeling' |
    'control' |
    'dating' |
    'glossing'

} | {
    type: 'Removal',

    /**
     * @see crm:P113 removed
     */
    removed: string[],

    /**
     * Usually, roll features are being added.
     * Sometimes however, we may see traces of features
     * that have been removed, e.g. through bright spots on
     * the roll.
     * @see crm:P21 had general purpose
     */
    purpose: 'delabeling'
})

/**
 * A physical copy of a roll, held at a specific location.
 * Each roll copy has its own set of features, measurements,
 * conditions, and modifications. Multiple copies of the same
 * roll may exist across different archives or collections.
 * @see lrmoo:F5 Item
 */
export interface RollCopy extends WithType<'RollCopy'>, WithId {
    /**
     * A list of operations that have been applied to this copy's features
     * (e.g. 'shifted', 'stretched') to normalize measurements
     * for comparison with other copies. Not exported to RDF.
     */
    ops: Array<'shifted' | 'stretched'>

    /**
     * Physical measurements of this roll copy, including
     * dimensions, punch diameter, hole separation, margins,
     * shift corrections, and information about the measuring software.
     * @see crm:P39i was measured by
     */
    measurements: Partial<{
        /**
         * The physical dimensions of the roll.
         * @see reo:dimensions
         */
        dimensions: {
            /**
             * The width of the roll.
             * @see reo:width
             */
            width: Millimeters,
            /**
             * The total height (length) of the roll.
             * @see reo:height
             */
            height: Millimeters,
            /**
             * The unit of measurement.
             * @see crm:P91 has unit
             */
            unit: 'mm'
        }

        /**
         * The average diameter of punched holes.
         * @see reo:punchDiameter
         */
        punchDiameter: Measure<'mm'>

        /**
         * The distance between adjacent tracker bar holes, in the
         * unit the scan was measured in.
         * @see reo:holeSeparation
         */
        holeSeparation: Measure<'px'> | Measure<'mm'>

        /**
         * The margins on the treble and bass sides of the roll.
         * Not exported to RDF.
         */
        margins: Margins<'px'> | Margins<'mm'>

        /**
         * The shift applied to align this copy with the others.
         * Not exported to RDF.
         */
        shift: Shift

        /**
         * The factor this copy's features were scaled by to align them
         * with the others. What it is put down to is stated apart: a
         * paper-stretch condition, or the speed the copy was cut for.
         * Not exported to RDF.
         */
        scale: number

        /**
         * Relates this copy's scan to the tracker bar: how the scanning
         * software's hole numbering was shifted onto the bar, and where
         * the track grid sits in the image. Not exported to RDF.
         */
        trackCalibration: TrackCalibration

        /**
         * Information about the software used to take the measurements.
         * @see crmdig:L23 used software or firmware
         */
        measuredBy: {
            /**
             * The name of the measurement software.
             * @see rdfs:label
             */
            software: string,
            /**
             * The version of the measurement software.
             * @see owl:versionInfo
             */
            version: string
            /**
             * The date on which the measurements were taken.
             * @format date
             * @see dcterms:date
             */
            date: Date
        }
    }>

    /**
     * The production event that created this roll copy.
     * @see lrmoo:R28i was produced by
     */
    production?: ProductionEvent

    /**
     * Condition assessments of this roll copy (e.g. paper stretch,
     * general wear). Each condition is an assumption annotatable
     * with a belief.
     * @see crm:P44 has condition
     */
    conditions: RollConditionAssignment[]

    /**
     * The institution or person holding this copy.
     * @see crm:P50 has current keeper
     */
    keeper: Agent

    /**
     * The physical features found on this copy, with shift
     * and stretch already applied when `ops` says so.
     * @see crm:P56 bears feature
     */
    features: AnyFeature[]

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
}

/**
 * Reads the features of a copy as the tracker bar would read them.
 * Holes on a position the bar does not read carry no symbol and are
 * dropped, which is what happens physically as well.
 */
export function asSymbols(
    features: AnyFeature[],
    bar: TrackerBar = welteT100
): AnySymbol[] {
    return features
        .filter(feature => feature.type === 'Hole')
        .flatMap((feature): AnySymbol[] => {
            const meaning = bar.meaningOf(feature.vertical.from)
            if (!meaning) return []

            return [{
                id: `symbol_${v4()}`,
                ...meaning,
                carriers: [assignReference(feature.id)]
            }]
        })
}

/**
 * The tracks a copy carries holes on that the tracker bar does not read.
 * A non-empty result usually means the scan is calibrated wrongly.
 */
export function unreadTracks(
    features: AnyFeature[],
    bar: TrackerBar = welteT100
): Map<Track, number> {
    const counts = new Map<Track, number>()
    features
        .filter(feature => feature.type === 'Hole')
        .filter(feature => !bar.meaningOf(feature.vertical.from))
        .forEach(feature => {
            const position = feature.vertical.from
            counts.set(position, (counts.get(position) || 0) + 1)
        })
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

