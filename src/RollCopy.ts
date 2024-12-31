import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { AnyRollEvent, ConditionState, EventSpan, Expression, ExpressionType, Hand, MeasurementEvent, Note, SoftwareExecution } from "./types";
import { AnyEditorialAction, Conjecture, HandAssignment, Shift, Stretch } from "./EditorialActions";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { GottschewskiConversion, PlaceTimeConversion } from "./PlaceTimeConversion";

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

    measurement?: MeasurementEvent
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
    }

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
                } as Note)
            }
        }

        averagePunchDiameter /= circularPunches
        averagePunchDiameter /= Math.PI

        this.measurement = {
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
            events,
            executions: [
                {
                    software: 'https://github.com/pianoroll/roll-image-parser',
                    date
                }
            ]
        }

        this.scan = `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`

        this.calculateModifiedEvents()
    }

    readFromRawMIDI(
        midiBuffer: ArrayBuffer,
        conversion: PlaceTimeConversion = new GottschewskiConversion()
    ) {
        const midi = read(midiBuffer)
        const events: AnyRollEvent[] = []

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
                        id: v4()
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
                        hasPitch: span.pitch
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
                        id: v4()
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
                        id: v4()
                    },
                )
            }
        }

        this.measurement = {
            id: v4(),
            events,
            executions: [
                {
                    software: '',
                    date: 'unknown'
                },
            ]
        }

        this.calculateModifiedEvents();
    }

    addHand(hand: Hand) {
        this.hands.push(hand)
    }

    applyActions(actions: AnyEditorialAction[]) {
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
        if (!this.measurement) return

        this.modifiedEvents = structuredClone(this.measurement.events)

        for (const conjecture of this.conjectures) {
            applyConjecture(conjecture, this.modifiedEvents)
        }

        if (this.stretch) applyStretch(this.stretch, this.modifiedEvents)
        if (this.shift) applyShift(this.shift, this.modifiedEvents)

        this.modifiedEvents.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)
    }

    get events() {
        return this.modifiedEvents
    }

    set events(newEvents: AnyRollEvent[]) {
        if (!this.measurement) return
        this.measurement.events = newEvents
        this.calculateModifiedEvents()
    }

    insertEvent(event: AnyRollEvent, softwareExec?: SoftwareExecution) {
        if (!this.measurement) return

        this.measurement.events.push(event)
        this.measurement.events.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)

        if (softwareExec && !this.measurement.executions.includes(softwareExec)) {
            this.measurement.executions.push(softwareExec)
        }

        this.calculateModifiedEvents()
    }

    insertEvents(events: AnyRollEvent[], softwareExec?: SoftwareExecution) {
        if (!this.measurement) return

        if (!this.measurement.events) this.measurement.events = []
        this.measurement.events.push(...events)
        this.measurement.events.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)

        if (softwareExec && !this.measurement.executions.includes(softwareExec)) {
            this.measurement.executions.push(softwareExec)
        }

        this.calculateModifiedEvents()
    }

    removeEvent(eventId: string) {
        if (!this.measurement) return

        const index = this.measurement.events.findIndex(e => e.id === eventId)
        if (index === -1) return
        this.measurement.events.splice(index, 1)
        this.calculateModifiedEvents()
    }

    shiftEventsVertically(ids: string[], amount: number) {
        if (!this.measurement) return

        const originalEvents = this.measurement.events.filter(event => ids.includes(event.id))
        for (const event of originalEvents) {
            event.hasDimension.vertical.from += amount;
            if (event.type === 'expression') {
                const prevKey = typeToKey(event.P2HasType)
                if (!prevKey) continue

                const shifted = keyToType(prevKey + amount)
                if (!shifted) continue

                event.P2HasType = shifted as ExpressionType
            }
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
        return this.events.findIndex(e => e.id === id) !== -1
            || this.measurement?.events.findIndex(e => e.id === id) !== -1
    }

    removeEditorialAction(action: AnyEditorialAction) {
        // TODO
        console.log(action)
    }

    get actions() {
        const result: AnyEditorialAction[] = [
            ...this.additions,
            ...this.conjectures,
        ]

        if (this.stretch) result.push(this.stretch)
        if (this.shift) result.push(this.shift)

        return result
    }
}
