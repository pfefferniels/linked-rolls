import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { RollMeasurement } from "./Measurement";
import { ConditionState } from "./Condition";
import { AnyRollEvent, Expression, HorizontalSpan, Note } from "./RollEvent";
import { AnyEditorialAssumption, Conjecture, Hand, HandAssignment, Shift, Stretch } from "./EditorialAssumption";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { WelteT100 } from "./TrackerBar";

const applyShift = (shift: Shift, to: AnyRollEvent[]) => {
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

const applyStretch = (stretch: Stretch, to: AnyRollEvent[]) => {
    for (const event of to) {
        event.horizontal.from *= stretch.factor
        if (event.horizontal.to) {
            event.horizontal.to *= stretch.factor
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

    asJSON() {
        return {
            id: this.id,
            siglum: this.siglum,
            productionEvent: this.productionEvent,
            conditions: this.conditions,
            location: this.location,
            measurements: this.measurements,
            events: this.events,
            scan: this.scan,
            stretch: this.stretch,
            shift: this.shift,
            hands: this.hands,
            additions: this.additions,
            conjectures: this.conjectures
        }
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

            const trackerHole = +hole.TRACKER_HOLE + rewindShift

            const noteAttack = +hole.NOTE_ATTACK.replace('px', '')
            const offset = +hole.OFF_TIME.replace('px', '')
            const height = +hole.WIDTH_ROW.replace('px', '')
            const column = +hole.ORIGIN_COL.replace('px', '')
            const columnWidth = +hole.WIDTH_COL.replace('px', '')

            const annotates = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column - 10},${noteAttack - 10},${columnWidth + 20},${height + 20}/128,/0/default.jpg`

            const event: Note | Expression = {
                ...(new WelteT100().meaningOf(trackerHole)),
                annotates,
                measurement,
                horizontal: {
                    unit: 'mm',
                    from: pixelsToMillimeters(noteAttack, dpi),
                    to: pixelsToMillimeters(offset, dpi)
                },
                id: v4()
            }
            events.push(event)
        }

        averagePunchDiameter /= circularPunches
        averagePunchDiameter /= Math.PI

        this.scan = `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`
        this.events = events
        this.measurements = [measurement]

        this.constituteEvents()
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


            const event: Note | Expression = {
                ...(new WelteT100().meaningOf(trackerHole)),
                horizontal: horizontalDimension,
                measurement,
                id: v4()
            }
            events.push(event)
        }


        this.events = events
        this.measurements = [measurement]

        this.constituteEvents()
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

        if (didChange || this.modifiedEvents.length === 0) {
            this.constituteEvents()
        }
    }

    private applyCovers() {
        const covers = this.modifiedEvents.filter(e => e.type === 'cover')
        const notes = this.modifiedEvents.filter(e => e.type === 'note' || e.type === 'expression')
        for (const cover of covers) {
            // Find either note or expression that is covered
            for (const event of notes) {
                // first check if the cover vertically covers a wider area 
                // than the note or expression
                const coveredVertically = event.vertical.from >= cover.vertical.from &&
                    event.vertical.from <= (cover.vertical.to || cover.vertical.from)

                if (!coveredVertically) continue

                // check if the cover partially covers the begin of the note or expression
                if (event.horizontal.from >= cover.horizontal.from &&
                    event.horizontal.from <= cover.horizontal.to) {
                    // the note starts where the cover ends
                    event.horizontal.from = cover.horizontal.to
                }

                // check if the cover partially covers the end of the note or expression
                if (event.horizontal.to >= cover.horizontal.from &&
                    event.horizontal.to <= cover.horizontal.to) {
                    // the note ends where the cover starts
                    event.horizontal.to = cover.horizontal.from
                }
            }
        }
    }

    private removeUnauthorisedAdditions() {
        for (const addition of this.additions) {
            if (!addition.hand.authorised) {
                for (const event of addition.target) {
                    // remove that event from the modified events
                    const index = this.modifiedEvents.findIndex(e => e.id === event.id)
                    if (index !== -1) {
                        this.modifiedEvents.splice(index, 1)
                    }
                }
            }
        }
    }


    /**
     * @note This is expensive. Use with care.
     */
    private constituteEvents() {
        this.modifiedEvents = structuredClone(this.events)

        // remove all handwritten texts
        this.modifiedEvents = this.modifiedEvents.filter(e => e.type !== 'handwrittenText')

        // remove all unauthorized modifications
        this.removeUnauthorisedAdditions()

        // cut note and expression events by covers
        // note: this should be done only after
        // possibly unauthorized covers have been removed
        this.applyCovers()

        for (const conjecture of this.conjectures) {
            applyConjecture(conjecture, this.modifiedEvents)
        }

        if (this.stretch) applyStretch(this.stretch, this.modifiedEvents)
        if (this.shift) applyShift(this.shift, this.modifiedEvents)

        this.modifiedEvents.sort((a, b) => a.horizontal.from - b.horizontal.from)
    }

    getOriginalEvents() {
        return this.events
    }

    getConstitutedEvents() {
        return this.modifiedEvents
    }

    setEvents(newEvents: AnyRollEvent[]) {
        this.events = newEvents
        this.constituteEvents()
    }

    insertEvent(event: AnyRollEvent) {
        this.events.push(event)
        this.events.sort((a, b) => a.horizontal.from - b.horizontal.from)

        if (!this.measurements.includes(event.measurement)) {
            this.measurements.push(event.measurement)
        }

        this.constituteEvents()
    }

    /**
     * This is a separate method, since recalculating the modified events 
     * is expensive.
     */
    insertEvents(events: AnyRollEvent[]) {
        this.events.push(...events)
        this.events.sort((a, b) => a.horizontal.from - b.horizontal.from)

        for (const event of events) {
            if (!this.measurements.includes(event.measurement)) {
                this.measurements.push(event.measurement)
            }
        }

        this.constituteEvents()
    }

    removeEvent(eventId: string) {
        const index = this.events.findIndex(e => e.id === eventId)
        if (index === -1) return
        this.events.splice(index, 1)

        this.constituteEvents()
    }

    shiftEventsVertically(ids: string[], amount: number, measurement: RollMeasurement) {
        const originalEvents = this.events.filter(event => ids.includes(event.id))
        for (const event of originalEvents) {
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

        if (!this.measurements.includes(measurement)) {
            this.measurements.push(measurement)
        }

        this.constituteEvents()
    }

    shallowClone(): RollCopy {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    hasEvent(otherEvent: AnyRollEvent) {
        return this.hasEventId(otherEvent.id)
    }

    hasEventId(id: string) {
        return this.getConstitutedEvents().findIndex(e => e.id === id) !== -1
            || this.events.findIndex(e => e.id === id) !== -1
    }

    getById(id: string) {
        return this.getConstitutedEvents().find(e => e.id === id)
            || this.events.find(e => e.id === id)
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

        this.constituteEvents()
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
