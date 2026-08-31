import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { ConditionState } from "./ConditionState";
import { AnySymbol } from "./Symbol";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { TrackerBar, welteT100 } from "./TrackerBar";
import { TrackCalibration } from "./TrackCalibration";
import { AnyFeature, Hole } from "./Feature";
import { assignReference, idsOf, ObjectAssumption, ValueAssumption } from "./Assumption";
import { WithId, WithType } from "./utils";
import { ActorAssignment } from "./Edit";

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
    /**
     * Horizontal shift in millimeters (along the roll length).
     */
    horizontal: number

    /**
     * Vertical shift in track numbers (across the tracker bar).
     */
    vertical: number
}

export const applyShift = (shift: Shift, copy: RollCopy) => {
    if (copy.ops.includes('shifted')) return

    const to = copy.features
    for (const event of to) {
        event.horizontal.from += shift.horizontal
        if (event.horizontal.to) {
            event.horizontal.to += shift.horizontal
        }

        event.vertical.from += shift.vertical
        if (event.vertical.to) {
            event.vertical.to += shift.vertical
        }
    }
    copy.ops = [...copy.ops, 'shifted']
    copy.measurements.shift = shift
}

export const applyStretch = (
    paperStretch: ObjectAssumption<PaperStretch>,
    copy: RollCopy
) => {
    if (copy.ops.includes('stretched')) return

    const stretch = paperStretch.factor
    const to = copy.features
    for (const event of to) {
        event.horizontal.from *= stretch
        if (event.horizontal.to) {
            event.horizontal.to *= stretch
        }
    }
    copy.ops = [...copy.ops, 'stretched']
    copy.conditions.push(paperStretch)
}

/**
 * A date value wrapped as an assumption, so that the date
 * can be annotated with a belief about its certainty and source.
 */
export type DateAssignment = ValueAssumption<Date>

/**
 * Describes the production of a roll copy, including the
 * manufacturing company, the roll system, and the paper used.
 * @see lrm:F33 Reproduction Event
 */
export interface ProductionEvent {
    /**
     * The company that produced the roll copy
     * (e.g. "M. Welte & Söhne").
     * @see crm:P14 carried out by
     */
    company: string

    /**
     * The roll system used for production
     * (e.g. "Welte-Mignon T100", "Welte-Mignon T98").
     */
    system: string

    /**
     * The paper type used for the roll copy.
     * @see P126:employed
     */
    paper: string

    /**
     * The date of production, if known.
     * @see crm:P4 has time-span
     */
    date?: DateAssignment
}

/**
 * This type denotes identifiable activities that modified
 * the roll copy after its production, e.g. annotations, repairs,
 * etc.
 * @see crm:E79 Part Addition, crm:E80 Part Removal
 */
export type Modification = Partial<{
    actor: ActorAssignment
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
     */
    purpose: 'delabeling'
})

/**
 * A physical copy of a roll, held at a specific location.
 * Each roll copy has its own set of features, measurements,
 * conditions, and modifications. Multiple copies of the same
 * roll may exist across different archives or collections.
 * @see crm:E22 Human-Made Object
 */
export interface RollCopy extends WithType<'RollCopy'>, WithId {
    /**
     * A list of operations that have been applied to this copy's features
     * (e.g. 'shifted', 'stretched') to normalize measurements
     * for comparison with other copies.
     */
    ops: Array<'shifted' | 'stretched'>

    /**
     * Physical measurements of this roll copy, including
     * dimensions, punch diameter, hole separation, margins,
     * shift corrections, and information about the measuring software.
     */
    measurements: Partial<{
        /**
         * The physical dimensions of the roll.
         */
        dimensions: {
            /**
             * The width of the roll in the given unit.
             */
            width: number,
            /**
             * The total height (length) of the roll in the given unit.
             */
            height: number,
            /**
             * The unit of measurement (e.g. 'mm').
             */
            unit: string
        }

        /**
         * The average diameter of punched holes.
         */
        punchDiameter: {
            /**
             * The measured punch diameter value.
             */
            value: number
            /**
             * The unit of measurement (e.g. 'mm').
             */
            unit: string
        }

        /**
         * The distance between adjacent tracker bar holes.
         */
        holeSeparation: {
            /**
             * The measured hole separation value.
             */
            value: number
            /**
             * The unit of measurement (e.g. 'px', 'mm').
             */
            unit: string
        }

        /**
         * The margins on the treble and bass sides of the roll.
         */
        margins: {
            /**
             * The margin on the treble side.
             */
            treble: number
            /**
             * The margin on the bass side.
             */
            bass: number
            /**
             * The unit of measurement (e.g. 'px', 'mm').
             */
            unit: string
        }

        shift: Shift

        /**
         * Relates this copy's scan to the tracker bar: how the scanning
         * software's hole numbering was shifted onto the bar, and where
         * the track grid sits in the image.
         */
        trackCalibration: TrackCalibration

        /**
         * Information about the software used to take the measurements.
         */
        measuredBy: {
            /**
             * The name of the measurement software.
             */
            software: string,
            /**
             * The version of the measurement software.
             */
            version: string
            /**
             * The date on which the measurements were taken.
             * @format date
             */
            date: Date
        }
    }>

    /**
     * The production event that created this roll copy.
     * @see lrm:R28i was produced by
     */
    production?: ProductionEvent

    /**
     * Condition assessments of this roll copy (e.g. paper stretch,
     * general wear). Each condition is an assumption annotatable
     * with a belief.
     */
    conditions: RollConditionAssignment[]

    /**
     * The current physical location or archive where this copy is held.
     * @see crm:P55 has current location
     */
    location: string

    /**
     * Provides a reconstructed version of the roll,
     * with shift, stretch and emendations already
     * taken into account. This property will not be
     * exported in the final JSON.
     */
    features: AnyFeature[]

    /**
     * @see crm:P31 was modified by
     */
    modifications: Modification[]

    /**
     * The scan URL or IIIF URL of the roll.
     * @see crm:P138i has representation
     */
    scan?: string
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
): Map<number, number> {
    const counts = new Map<number, number>()
    features
        .filter(feature => feature.type === 'Hole')
        .filter(feature => !bar.meaningOf(feature.vertical.from))
        .forEach(feature => {
            const track = feature.vertical.from
            counts.set(track, (counts.get(track) || 0) + 1)
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

    const separation = copy.measurements.holeSeparation?.value
    const bassMargin = copy.measurements.margins?.bass
    if (separation === undefined || bassMargin === undefined) return undefined

    return {
        unit: 'px',
        offset: bassMargin + 1.5 * separation,
        separation,
        shift: 0
    }
}

/** A hole record as the Stanford analysis files spell it. */
interface AtonHole {
    TRACKER_HOLE: string
    CENTROID_COL: string
    ORIGIN_COL: string
    WIDTH_COL: string
    CIRCULARITY: string
    PERIMETER: string
    NOTE_ATTACK?: string
    OFF_TIME?: string
}

/** Values in these files carry their unit as a suffix, e.g. "37.7646px". */
const px = (value: string) => parseFloat(value)

const millimeters = (pixels: number, dpi: number) => pixels / dpi * 25.4

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const mostFrequent = (values: number[]) => {
    const counts = values.reduce(
        (acc, value) => acc.set(value, (acc.get(value) || 0) + 1),
        new Map<number, number>()
    )
    return [...counts].sort(([, a], [, b]) => b - a)[0]?.[0]
}

/**
 * Only the first hole of a chain carries an attack and an off time;
 * the rest continue it. The rewind perforation carries neither, and it
 * is the last thing punched on the roll, so whatever the holes past the
 * final musical attack sit on is the rewind track.
 */
const rewindTrackIn = (holes: AtonHole[]) => {
    const lastMusical = holes.findLastIndex(hole => hole.NOTE_ATTACK)
    const trailing = holes.slice(lastMusical + 1).map(hole => +hole.TRACKER_HOLE)
    return mostFrequent(trailing)
}

/**
 * The phase of the tracker grid within the image. The analysis file
 * usually states it; where it does not, the holes themselves give it away,
 * since each sits close to the centre of its column.
 */
const gridOffsetOf = (holes: AtonHole[], separation: number, stated?: string) => {
    if (stated !== undefined) return px(stated)

    return median(holes.map(hole => px(hole.CENTROID_COL) - +hole.TRACKER_HOLE * separation))
}

const punchDiameterOf = (holes: AtonHole[], dpi: number) => {
    const circular = holes
        .filter(hole => px(hole.CIRCULARITY) > 0.95)
        .map(hole => millimeters(px(hole.PERIMETER), dpi) / Math.PI)

    if (!circular.length) return undefined

    return circular.reduce((sum, diameter) => sum + diameter, 0) / circular.length
}

export interface StanfordAtonOptions {
    /**
     * Added to the scanning software's hole numbering to reach the
     * tracker bar. Left out, it is inferred by putting the rewind
     * perforation on the bar's rewind track.
     */
    trackShift?: number

    bar?: TrackerBar
}

export function readFromStanfordAton(
    atonString: string,
    { trackShift, bar = welteT100 }: StanfordAtonOptions = {}
): RollCopy {
    const parser = new AtonParser()
    const json = parser.parse(atonString)

    const holes: AtonHole[] = json.ROLLINFO.HOLES.HOLE
    const druid = json.ROLLINFO.DRUID
    const separation = px(json.ROLLINFO.HOLE_SEPARATION)
    const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI)

    const rewindTrack = rewindTrackIn(holes)
    const shift = trackShift
        ?? (rewindTrack === undefined ? 0 : bar.rewindTrack - rewindTrack)

    const calibration: TrackCalibration = {
        unit: 'px',
        offset: gridOffsetOf(holes, separation, json.ROLLINFO.HOLE_OFFSET),
        separation,
        shift
    }

    const punchDiameter = punchDiameterOf(holes, dpi)

    const features = holes
        .filter(hole => hole.NOTE_ATTACK && hole.OFF_TIME)
        .map((hole): Hole => {
            const attack = px(hole.NOTE_ATTACK!)
            const release = px(hole.OFF_TIME!)
            const column = px(hole.ORIGIN_COL)
            const columnWidth = px(hole.WIDTH_COL)

            return {
                type: 'Hole',
                id: v4(),
                depiction: `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${attack},${columnWidth},${release - attack}/128,/270/default.jpg`,
                vertical: {
                    from: +hole.TRACKER_HOLE + shift,
                    unit: 'track'
                },
                horizontal: {
                    unit: 'mm',
                    from: millimeters(attack, dpi),
                    to: millimeters(release, dpi)
                }
            }
        })

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        location: '',
        modifications: [],
        scan: `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`,
        measurements: {
            dimensions: {
                width: millimeters(px(json.ROLLINFO.ROLL_WIDTH), dpi),
                height: millimeters(px(json.ROLLINFO.IMAGE_LENGTH), dpi),
                unit: 'mm'
            },
            ...(punchDiameter !== undefined && {
                punchDiameter: { value: punchDiameter, unit: 'mm' }
            }),
            holeSeparation: {
                value: separation,
                unit: 'px'
            },
            margins: {
                treble: px(json.ROLLINFO.HARD_MARGIN_TREBLE),
                bass: px(json.ROLLINFO.HARD_MARGIN_BASS),
                unit: 'px'
            },
            trackCalibration: calibration
        },
        features
    }
}

/**
 * How a MIDI key number in one of Spencer Chase's roll files names a
 * tracker bar track.
 *
 * The note block follows the obvious rule, `pitch - 13`, which puts
 * track 11 on MIDI 24 as the T100 compass requires. The bass expression
 * block does not: it reads two tracks high, and subtracting two is what
 * has made these files come out right so far.
 *
 * The boundary between the two rules is unresolved. Taken literally the
 * rules leave tracks 8 and 9 unreachable and jump from track 7 to track 10,
 * which no lateral offset can produce, so at least one of them is
 * approximate. Settling it needs a Spencer file whose expression holes
 * can be checked against the roll, hence the option to override.
 */
export const spencerTrackOf = (pitch: number) => {
    const track = pitch - 13
    return track < 10 ? track - 2 : track
}

/**
 * Spencer Chase's rolls seem to be scanned at a roll speed of
 * 83 (=8.3 feet per minute).
 */
export function readFromSpencerMIDI(
    midiBuffer: ArrayBuffer,
    conversion: PlaceTimeConversion = new KinematicConversion(8.3),
    trackOf: (pitch: number) => number = spencerTrackOf
): RollCopy {
    const features = asSpans(read(midiBuffer))
        .filter(span => span.type === 'note')
        .map((span): Hole => ({
            type: 'Hole',
            id: v4(),
            vertical: {
                from: trackOf(span.pitch),
                unit: 'track'
            },
            horizontal: {
                from: conversion.timeToPlace(span.onsetMs / 1000) * 10,
                to: conversion.timeToPlace(span.offsetMs / 1000) * 10,
                unit: 'mm'
            }
        }))

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        location: '',
        measurements: {},
        modifications: [],
        features
    }
}

/**
 * Moves features across the tracker bar. What the new position means is
 * left to the tracker bar to say, since meaning belongs to the symbols
 * read off a copy rather than to the holes themselves.
 */
export function shiftVertically(features: AnyFeature[], amount: number) {
    features.forEach(feature => {
        feature.vertical.from += amount
        if (feature.vertical.to !== undefined) {
            feature.vertical.to += amount
        }
    })
}

export const findCopiesCarrying = (sources: RollCopy[], symbol: AnySymbol) => {
    const result: Set<string> = new Set()

    for (const feature of idsOf(symbol.carriers)) {
        for (const copy of sources) {
            if (copy.features.findIndex(f => f.id === feature)) {
                result.add(copy.id)
            }
        }
    }
    return result
}