import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { RollMeasurement } from "./Measurement";
import { ConditionState } from "./Condition";
import { AnyRollEvent, EventSpan, Expression, ExpressionType, Note } from "./RollEvent";
import { AnyEditorialAssumption, Conjecture, Hand, HandAssignment, Shift, Stretch } from "./EditorialAssumption";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";

const applyShift = (shift: Shift, to: AnyRollEvent[]) => {
    for (const event of to) {
        event.hasDimension.horizontal.from += shift.horizontal
        if (event.hasDimension.horizontal.to) {
            event.hasDimension.horizontal.to += shift.horizontal
        }

        event.hasDimension.vertical.from += shift.vertical
        if (event.hasDimension.vertical.to) {
            event.hasDimension.vertical.to += shift.vertical
        }
    }
}

const applyStretch = (stretch: Stretch, to: AnyRollEvent[]) => {
    for (const event of to) {
        event.hasDimension.horizontal.from *= stretch.factor
        if (event.hasDimension.horizontal.to) {
            event.hasDimension.horizontal.to *= stretch.factor
        }
    }
}

const applyConjecture = (conjecture: Conjecture, to: AnyRollEvent[]) => {
    if (!conjecture.with.length || !conjecture.replaced.length) return

    for (const toDelete of conjecture.replaced) {
        const index = to.findIndex(e => e.id === toDelete.id)
        if (index === -1) {
            continue
        }

        to.splice(index, 1)
    }

    to.push(...conjecture.with)
}

interface ProductionEvent {
    company: string
    system: string
    paper: string
    date: string
}

export class RollCopy {
    id: string
    siglum: string // P149 is identified by (Conceptual Object Apellation)

    productionEvent: ProductionEvent
    conditions: ConditionState[]
    location: string

    measurements: RollMeasurement[]
    private events: AnyRollEvent[]
    scan?: string // P138 has representation => IIIF Image Link (considered to be an E38 Image)

    stretch?: Stretch
    shift?: Shift

    hands: Hand[]
    additions: HandAssignment[]
    conjectures: Conjecture[]

    private modifiedEvents: AnyRollEvent[]

    constructor() {
        this.id = v4()
        this.siglum = '[no siglum]'
        this.productionEvent = {
            date: '',
            paper: '',
            company: '',
            system: ''
        }
        this.location = ''
        this.conditions = []
        this.modifiedEvents = []
        this.hands = []
        this.additions = []
        this.conjectures = []
        this.measurements = []
        this.events = []
    }

    /**
     * Note: this overwrites any existing measurements and events.
     */
    readFromStanfordAton(atonString: string, adjustByRewind: boolean = true, shift = 0) {
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
        const midiShift = adjustByRewind ? typeToKey('Rewind')! - lastHole : shift

        const measurement: RollMeasurement = {
            id: v4(),
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
            software: 'https://github.com/pianoroll/roll-image-parser',
            date
        }

        let circularPunches = 0
        const events = []
        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i]

            const circularity = +hole.CIRCULARITY.replace('px', '')
            if (circularity > 0.95) {
                const perimeterInMM = pixelsToMillimeters(+hole.PERIMETER.replace('px', ''), dpi)
                averagePunchDiameter += perimeterInMM
                circularPunches += 1
            }

            if (!hole.NOTE_ATTACK || !hole.OFF_TIME) continue

            const midiKey = +hole.TRACKER_HOLE + midiShift
            const trackerHole = +hole.TRACKER_HOLE + rewindShift
            // console.log('key=', midiKey)

            const noteAttack = +hole.NOTE_ATTACK.replace('px', '')
            const offset = +hole.OFF_TIME.replace('px', '')
            const height = +hole.WIDTH_ROW.replace('px', '')
            const column = +hole.ORIGIN_COL.replace('px', '')
            const columnWidth = +hole.WIDTH_COL.replace('px', '')

            const dimension: EventSpan = {
                hasUnit: 'mm',
                from: pixelsToMillimeters(noteAttack, dpi),
                to: pixelsToMillimeters(offset, dpi)
            }

            const annotates = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column - 10},${noteAttack - 10},${columnWidth + 20},${height + 20}/128,/0/default.jpg`

            if (midiKey <= 23 || midiKey >= 104) {
                const type = keyToType(midiKey)
                if (!type) {
                    console.log('unknown expression key', midiKey, 'encountered. Ignoring.')
                    continue
                }

                const scope = midiKey <= 23 ? 'bass' : 'treble'

                events.push({
                    type: 'expression',
                    id: v4(),
                    P2HasType: type,
                    hasScope: scope,
                    hasDimension: {
                        id: v4(),
                        horizontal: dimension,
                        vertical: {
                            from: trackerHole,
                            hasUnit: 'track'
                        }
                    },
                    annotates: annotates,
                    measurement
                } as Expression)
            }
            else {
                events.push({
                    type: 'note',
                    id: v4(),
                    annotates: `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column - 10},${noteAttack - 10},${columnWidth + 20},${height + 20}/128,/0/default.jpg`,
                    hasDimension: {
                        id: v4(),
                        horizontal: {
                            hasUnit: 'mm',
                            from: pixelsToMillimeters(noteAttack, dpi),
                            to: pixelsToMillimeters(offset, dpi)
                        },
                        vertical: {
                            hasUnit: 'track',
                            from: trackerHole
                        }
                    },
                    hasPitch: midiKey,
                    measurement
                } as Note)
            }
        }

        averagePunchDiameter /= circularPunches
        averagePunchDiameter /= Math.PI

        this.scan = `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`
        this.events = events
        this.measurements = [measurement]

        this.calculateModifiedEvents()
    }

    /**
     * Spencer Chase's rolls seem to be scanned at a roll speed of 
     * 83 (=8.3 feet per minute).
     * 
     * @param midiBuffer 
     * @param conversion 
     */
    readFromSpencerMIDI(
        midiBuffer: ArrayBuffer,
        conversion: PlaceTimeConversion = new KinematicConversion(8.3)
    ) {
        const midi = read(midiBuffer)
        const events: AnyRollEvent[] = []

        const measurement: RollMeasurement = {
            date: 'unknown',
            id: v4(),
            software: 'unknown'
        }

        const spans = asSpans(midi)

        for (const span of spans) {
            const left = conversion.timeToPlace(span.onsetMs / 1000) * 10
            const right = conversion.timeToPlace(span.offsetMs / 1000) * 10

            const horizontalDimension: EventSpan = {
                from: left,
                to: right,
                hasUnit: 'mm'
            }

            if (span.type === 'note') {
                const midiShift = 13
                const trackerHole = span.pitch - midiShift

                if (trackerHole <= 10 || trackerHole >= 91) {
                    const scope = trackerHole <= 10 ? 'bass' : 'treble'

                    // for whatever reasons, the expression tracks
                    // of the Spencer Chase's MIDI rolls are off
                    // by two on the bass-side.
                    const bassCorrection = -2
                    const type = (scope === 'bass' ? keyToType(trackerHole + midiShift + bassCorrection) : keyToType(trackerHole + midiShift)) as ExpressionType

                    events.push({
                        type: 'expression',
                        P2HasType: type,
                        hasScope: trackerHole <= 10 ? 'bass' : 'treble',
                        hasDimension: {
                            horizontal: horizontalDimension,
                            vertical: {
                                from: scope === 'bass' ? trackerHole + bassCorrection : trackerHole,
                                hasUnit: 'track'
                            }
                        },
                        id: v4(),
                        measurement
                    })
                }
                else {
                    events.push({
                        type: 'note',
                        id: v4(),
                        hasDimension: {
                            horizontal: horizontalDimension,
                            vertical: {
                                from: trackerHole,
                                hasUnit: 'track'
                            }
                        },
                        hasPitch: span.pitch,
                        measurement
                    })
                }
            }
            else if (span.type === 'sustain') {
                events.push(
                    {
                        type: 'expression',
                        hasDimension: {
                            horizontal: {
                                from: left,
                                to: left + 5,
                                hasUnit: 'mm'
                            },
                            vertical: {
                                from: typeToKey('SustainPedalOn')!,
                                hasUnit: 'track'
                            }
                        },
                        P2HasType: 'SustainPedalOn',
                        hasScope: 'treble',
                        id: v4(),
                        measurement
                    },
                    {
                        type: 'expression',
                        hasDimension: {
                            horizontal: {
                                from: right,
                                to: right + 5,
                                hasUnit: 'mm'
                            },
                            vertical: {
                                from: typeToKey('SustainPedalOff')!,
                                hasUnit: 'track'
                            }
                        },
                        P2HasType: 'SustainPedalOff',
                        hasScope: 'treble',
                        id: v4(),
                        measurement
                    },
                )
            }
        }

        this.events = events
        this.measurements = [measurement]

        this.calculateModifiedEvents();
    }

    addHand(hand: Hand) {
        this.hands.push(hand)
    }

    applyActions(actions: AnyEditorialAssumption[]) {
        let didChange = false
        for (const action of actions) {
            if (action.type === 'stretch') {
                this.stretch = action
                didChange = true
            }
            else if (action.type === 'shift') {
                this.shift = action
                didChange = true
            }
            else if (action.type === 'conjecture' && action.replaced.every(e => this.hasEventId(e.id))) {
                this.conjectures.push(action)
                didChange = true
            }
            else if (action.type === 'handAssignment' && action.target.every(e => this.hasEventId(e.id))) {
                this.additions.push(action)
                didChange = true
            }
        }

        if (didChange) {
            this.calculateModifiedEvents()
        }
    }

    /**
     * @note This is expensive. Use with care.
     */
    private calculateModifiedEvents() {
        this.modifiedEvents = structuredClone(this.events)

        for (const conjecture of this.conjectures) {
            applyConjecture(conjecture, this.modifiedEvents)
        }

        if (this.stretch) applyStretch(this.stretch, this.modifiedEvents)
        if (this.shift) applyShift(this.shift, this.modifiedEvents)

        this.modifiedEvents.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)
    }

    getEvents() {
        return this.modifiedEvents
    }

    setEvents(newEvents: AnyRollEvent[]) {
        this.events = newEvents
        this.calculateModifiedEvents()
    }

    insertEvent(event: AnyRollEvent) {
        this.events.push(event)
        this.events.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)

        if (!this.measurements.includes(event.measurement)) {
            this.measurements.push(event.measurement)
        }

        this.calculateModifiedEvents()
    }

    /**
     * This is a separate method, since recalculating the modified events 
     * is expensive.
     */
    insertEvents(events: AnyRollEvent[]) {
        this.events.push(...events)
        this.events.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)

        for (const event of events) {
            if (!this.measurements.includes(event.measurement)) {
                this.measurements.push(event.measurement)
            }
        }

        this.calculateModifiedEvents()
    }

    removeEvent(eventId: string) {
        const index = this.events.findIndex(e => e.id === eventId)
        if (index === -1) return
        this.events.splice(index, 1)

        this.calculateModifiedEvents()
    }

    shiftEventsVertically(ids: string[], amount: number, measurement: RollMeasurement) {
        const originalEvents = this.events.filter(event => ids.includes(event.id))
        for (const event of originalEvents) {
            event.measurement = measurement // replace the measurement
            event.hasDimension.vertical.from += amount;
            if (event.type === 'expression') {
                const prevKey = typeToKey(event.P2HasType)
                if (!prevKey) continue

                const shifted = keyToType(prevKey + amount)
                if (!shifted) continue

                event.P2HasType = shifted as ExpressionType
            }
        }

        if (!this.measurements.includes(measurement)) {
            this.measurements.push(measurement)
        }

        this.calculateModifiedEvents()
    }

    shallowClone(): RollCopy {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    hasEvent(otherEvent: AnyRollEvent) {
        return this.hasEventId(otherEvent.id)
    }

    hasEventId(id: string) {
        return this.getEvents().findIndex(e => e.id === id) !== -1
            || this.events.findIndex(e => e.id === id) !== -1
    }

    removeEditorialAction(assumption: AnyEditorialAssumption) {
        if (assumption.type === 'handAssignment') {
            const index = this.additions.indexOf(assumption)
            if (index !== -1) this.additions.splice(index, 1)
        }
        else if (assumption.type === 'conjecture') {
            const index = this.conjectures.indexOf(assumption)
            if (index !== -1) this.conjectures.splice(index, 1)
        }
        else if (assumption.type === 'stretch') {
            this.stretch = undefined
        }
        else if (assumption.type === 'shift') {
            this.shift = undefined
        }
        else {
            throw new Error('Unsupported assumption type provided')
        }

        this.calculateModifiedEvents()
    }

    get actions() {
        const result: AnyEditorialAssumption[] = [
            ...this.additions,
            ...this.conjectures,
        ]

        if (this.stretch) result.push(this.stretch)
        if (this.shift) result.push(this.shift)

        return result
    }
}
