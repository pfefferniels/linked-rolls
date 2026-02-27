import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { ConditionState } from "./ConditionState";
import { AnySymbol } from "./Symbol";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { WelteT100 } from "./TrackerBar";
import { AnyFeature, Hole, HorizontalSpan } from "./Feature";
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

export function asSymbols(
    features: AnyFeature[],
    _: boolean = false // todo: applyCovers
): AnySymbol[] {
    return features
        .filter(feature => feature.type === 'Hole')
        .map((feature): AnySymbol => {
            return {
                id: `symbol_${v4()}`,
                ...new WelteT100().meaningOf(feature.vertical.from),
                carriers: [assignReference(feature.id)]
            }
        })
}

export function readFromStanfordAton(atonString: string, adjustByRewind: boolean = true, shift = 0): RollCopy {
    function pixelsToMillimeters(pixels: number, dpi: number): number {
        return pixels / dpi * 25.4;
    }

    const parser = new AtonParser()
    const json = parser.parse(atonString)

    const holes = json.ROLLINFO.HOLES.HOLE
    const druid = json.ROLLINFO.DRUID
    const holeSeparation = parseFloat(json.ROLLINFO.HOLE_SEPARATION.replace('px'))
    const hardMarginBass = parseFloat(json.ROLLINFO.HARD_MARGIN_BASS.replace('px'))
    const hardMarginTreble = parseFloat(json.ROLLINFO.HARD_MARGIN_TREBLE.replace('px'))
    const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI.replace('ppi'))
    const rollWidth = parseFloat(json.ROLLINFO.ROLL_WIDTH.replace('px')) / dpi * 25.4
    const rollHeight = parseFloat(json.ROLLINFO.IMAGE_LENGTH.replace('px')) / dpi * 25.4
    let averagePunchDiameter = -1

    const lastHole = +holes[holes.length - 1].TRACKER_HOLE
    const rewindShift = adjustByRewind ? 91 - lastHole : shift

    const copy: RollCopy = {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        location: '',
        modifications: [],
        measurements: {
            dimensions: {
                width: rollWidth,
                height: rollHeight,
                unit: 'mm'
            },
            punchDiameter: {
                value: averagePunchDiameter,
                unit: 'mm'
            },
            holeSeparation: {
                value: holeSeparation,
                unit: 'px'
            },
            margins: {
                treble: hardMarginTreble,
                bass: hardMarginBass,
                unit: 'px'
            },
        },
        features: []
    }


    let circularPunches = 0
    const features = []
    for (let i = 0; i < holes.length; i++) {
        const hole = holes[i]

        const circularity = +hole.CIRCULARITY.replace('px', '')
        if (circularity > 0.95) {
            const perimeterInMM = pixelsToMillimeters(+hole.PERIMETER.replace('px', ''), dpi)
            averagePunchDiameter += perimeterInMM
            circularPunches += 1
        }

        if (!hole.NOTE_ATTACK || !hole.OFF_TIME) continue

        const trackerHole = +hole.TRACKER_HOLE + rewindShift

        const noteAttack = +hole.NOTE_ATTACK.replace('px', '')
        const offset = +hole.OFF_TIME.replace('px', '')
        const height = offset - noteAttack
        const column = +hole.ORIGIN_COL.replace('px', '')
        const columnWidth = +hole.WIDTH_COL.replace('px', '')

        const depiction = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/270/default.jpg`

        const feature: Hole = {
            type: 'Hole',
            id: v4(),
            depiction,
            vertical: {
                from: trackerHole,
                unit: 'track'
            },
            horizontal: {
                unit: 'mm',
                from: pixelsToMillimeters(noteAttack, dpi),
                to: pixelsToMillimeters(offset, dpi)
            }
        }
        features.push(feature)
    }

    averagePunchDiameter /= circularPunches
    averagePunchDiameter /= Math.PI

    copy.scan = `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`
    copy.features = features

    return copy
}

/**
 * Spencer Chase's rolls seem to be scanned at a roll speed of 
 * 83 (=8.3 feet per minute).
 * 
 * @param midiBuffer 
 * @param conversion 
 */
export function readFromSpencerMIDI(
    midiBuffer: ArrayBuffer,
    conversion: PlaceTimeConversion = new KinematicConversion(8.3)
): RollCopy {
    const midi = read(midiBuffer)
    const features: Hole[] = []

    const copy: RollCopy = {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        location: '',
        measurements: {},
        modifications: [],
        features: [],
    }

    const spans = asSpans(midi)

    for (const span of spans) {
        const left = conversion.timeToPlace(span.onsetMs / 1000) * 10
        const right = conversion.timeToPlace(span.offsetMs / 1000) * 10

        const horizontalDimension: HorizontalSpan = {
            from: left,
            to: right,
            unit: 'mm'
        }

        if (span.type !== 'note') continue


        const midiShift = 13
        let trackerHole = span.pitch - midiShift

        // for whatever reasons, the expression tracks
        // of the Spencer Chase's MIDI rolls are off
        // by two on the bass-side.
        if (trackerHole < 10) {
            trackerHole -= 2
        }


        const feature: Hole = {
            type: 'Hole',
            vertical: {
                from: trackerHole,
                unit: 'track'
            },
            horizontal: horizontalDimension,
            id: v4()
        }
        features.push(feature)
    }


    copy.features = features
    return copy
}

export function shiftVertically(
    features: Hole[],
    amount: number
) {
    for (const event of features) {
        event.vertical.from += amount;
        try {
            const newEvent = new WelteT100().meaningOf(event.vertical.from)
            for (const key in newEvent) {
                (event as any)[key] = (newEvent as any)[key]
            }
        }
        catch (e) {
            console.error(e)
        }
    }
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