import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { ConditionState } from "./ConditionState";
import { AnySymbol } from "./Symbol";
import { assign, EditorialAssumption, flat } from "./EditorialAssumption";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { WelteT100 } from "./TrackerBar";
import { HorizontalSpan, RollFeature } from "./Feature";

/**
 * This condition state is used to describe to roll's 
 * paper shrinkage or stretching. It might be calculated
 * on the basis of comparing the vertical or horizontal 
 * extent with other witnesses of the same roll.
 */
export interface PaperStretch extends ConditionState<'paper-stretch'> {
    factor: number
}

export interface GeneralRollCondition extends ConditionState<'general'> { }

export type RollConditionAssignment = EditorialAssumption<'conditionAssignment', GeneralRollCondition | PaperStretch>

export interface Shift {
    horizontal: number
    vertical: number
}

const applyShift = (shift: Shift, to: RollFeature[]) => {
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
}

const applyStretch = (stretch: number, to: RollFeature[]) => {
    for (const event of to) {
        event.horizontal.from *= stretch
        if (event.horizontal.to) {
            event.horizontal.to *= stretch
        }
    }
}

export type DateAssignment = EditorialAssumption<'dateAssignment', Date>

export interface ProductionEvent {
    company: string
    system: string
    paper: string
    date: DateAssignment
}

export class RollCopy {
    type: 'RollCopy' = 'RollCopy'
    id: string = v4()

    measurements: Partial<{
        dimensions: {
            width: number,
            height: number,
            unit: string
        }

        punchDiameter: {
            value: number
            unit: string
        }

        holeSeparation: {
            value: number
            unit: string
        }

        margins: {
            treble: number
            bass: number
            unit: string
        }

        shift: Shift

        measuredBy: {
            software: string,
            version: string
            date: Date
        }
    }> = {}

    productionEvent?: ProductionEvent
    conditions: RollConditionAssignment[] = []
    location: string = ''

    /**
     * Provides a reconstructed version of the roll,
     * with shift, stretch and emendations already
     * taken into account. This property will not be
     * exported in the final JSON.
     */
    features: RollFeature[] = []
    scan?: string // P138 has representation => IIIF Image Link (considered to be an E38 Image)

    insertFeature(feature: RollFeature) {
        this.measurements.shift && applyShift(this.measurements.shift, [feature])
        const stretch = flat(this.conditions)
            .find(state => state.type === 'paper-stretch')
        if (stretch) {
            applyStretch(stretch.factor, [feature])
        }
        this.features.push(feature)
    }

    setShift(shift: Shift) {
        this.measurements.shift = shift
        applyShift(shift, this.features)
    }

    setStretch(stretch: EditorialAssumption<'conditionAssignment', PaperStretch>) {
        this.conditions.push(stretch)
        applyStretch(flat(stretch).factor, this.features)
    }

    shallowClone(): RollCopy {
        const copy = new RollCopy()
        copy.id = this.id
        copy.measurements = { ...this.measurements }
        copy.productionEvent = this.productionEvent
        copy.location = this.location
        copy.conditions = [...this.conditions]
        copy.scan = this.scan
        copy.features = [...this.features]
        return copy
    }
}

export function asSymbols(features: RollFeature[]): AnySymbol[] {
    return features.map((feature): AnySymbol => {
        return {
            id: `symbol_${v4()}`,
            ...new WelteT100().meaningOf(feature.vertical.from),
            carriers: [assign('carrierAssignment', feature)]
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

    const copy: RollCopy = new RollCopy()
    copy.measurements = {
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
        // todo
        shift: {
            horizontal: 0,
            vertical: 0
        }
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

        const annotates = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/270/default.jpg`

        const feature: RollFeature = {
            id: v4(),
            annotates,
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
    const features: RollFeature[] = []

    const copy = new RollCopy()

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


        const feature: RollFeature = {
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
    features: RollFeature[],
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

    for (const feature of flat(symbol.carriers)) {
        for (const copy of sources) {
            if (copy.features.includes(feature)) {
                result.add(copy.id)
            }
        }
    }
    return result
}