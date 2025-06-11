import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { RollMeasurement } from "./Measurement";
import { ConditionState } from "./Condition";
import { AnySymbol } from "./Symbol";
import { Shift, Stretch } from "./EditorialAssumption";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { WelteT100 } from "./TrackerBar";
import { HorizontalSpan, RollFeature } from "./Feature";

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

const applyStretch = (stretch: Stretch, to: RollFeature[]) => {
    for (const event of to) {
        event.horizontal.from *= stretch.factor
        if (event.horizontal.to) {
            event.horizontal.to *= stretch.factor
        }
    }
}

interface ProductionEvent {
    company: string
    system: string
    paper: string
    date: string
}

export class RollCopy {
    id: string = v4()

    dimensions?: {
        width: number,
        height: number,
        unit: string
    }

    punchDiameter?: {
        value: number
        unit: string
    }

    holeSeparation?: {
        value: number
        unit: string
    }

    margins?: {
        treble: number
        bass: number
        unit: string
    }

    stretch?: Stretch
    shift?: Shift

    productionEvent?: ProductionEvent
    conditions: ConditionState[] = []
    location: string = ''

    transcriptions: RollMeasurement[] = []

    // will not be exported in final JSON. Shift, stretch
    // and emendations are applied already.
    features: RollFeature[] = []
    scan?: string // P138 has representation => IIIF Image Link (considered to be an E38 Image)

    insertFeature(feature: RollFeature) {
        this.shift && applyShift(this.shift, [feature])
        this.stretch && applyStretch(this.stretch, [feature])
        this.features.push(feature)
    }

    setShift(shift: Shift) {
        this.shift = shift
        applyShift(shift, this.features)
    }

    setStretch(stretch: Stretch) {
        this.stretch = stretch
        applyStretch(stretch, this.features)
    }
}

export function asSymbols(copy: RollCopy): AnySymbol[] {
    return copy.features.map(feature => {
        return {
            id: `symbol_${v4()}`,
            ...new WelteT100().meaningOf(feature.vertical.from),
            isCarriedBy: [feature]
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
    const date = json.ROLLINFO.ANALYSIS_DATE
    const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI.replace('ppi'))
    const rollWidth = parseFloat(json.ROLLINFO.ROLL_WIDTH.replace('px')) / dpi * 25.4
    const rollHeight = parseFloat(json.ROLLINFO.IMAGE_LENGTH.replace('px')) / dpi * 25.4
    let averagePunchDiameter = -1

    const lastHole = +holes[holes.length - 1].TRACKER_HOLE
    const rewindShift = adjustByRewind ? 91 - lastHole : shift

    const measurement = {
        id: `measurement_${v4().slice(0, 8)}`,
        software: 'https://github.com/pianoroll/roll-image-parser',
        date
    }

    const copy: RollCopy = new RollCopy()

    copy.dimensions = {
        width: rollWidth,
        height: rollHeight,
        unit: 'mm'
    }

    copy.punchDiameter = {
        value: averagePunchDiameter,
        unit: 'mm'
    }

    copy.holeSeparation = {
        value: holeSeparation,
        unit: 'px'
    }

    copy.margins = {
        treble: hardMarginTreble,
        bass: hardMarginBass,
        unit: 'px'
    }

    copy.transcriptions = [measurement]

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
        const height = +hole.WIDTH_ROW.replace('px', '')
        const column = +hole.ORIGIN_COL.replace('px', '')
        const columnWidth = +hole.WIDTH_COL.replace('px', '')

        const annotates = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column - 10},${noteAttack - 10},${columnWidth + 20},${height + 20}/128,/0/default.jpg`

        const feature: RollFeature = {
            id: v4(),
            annotates,
            vertical: {
                from: trackerHole,
                unit: 'track'
            },
            measurement,
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
    copy.transcriptions = [measurement]

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

    const measurement: RollMeasurement = {
        date: 'unknown',
        id: v4(),
        software: 'unknown'
    }

    const copy = new RollCopy()
    copy.transcriptions.push(measurement)

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
            measurement,
            id: v4()
        }
        features.push(feature)
    }


    copy.features = features
    return copy
}

export function shiftVertically(
    features: RollFeature[],
    amount: number,
    measurement: RollMeasurement
) {
    for (const event of features) {
        event.measurement = measurement // replace the measurement
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

    for (const feature of symbol.isCarriedBy) {
        for (const copy of sources) {
            if (copy.features.includes(feature)) {
                result.add(copy.id)
            }
        }
    }
    return result
}