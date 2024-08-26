import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { AnyRollEvent, ConditionAssessment, ConditionState, EventSpan, Expression, ManualEditing, MeasurementEvent, Note, PhysicalRollCopy } from "./types";
import { AnyEditorialAction, Conjecture, HandAssignment, Shift, Stretch } from "./EditorialActions";

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

export class RollCopy {
    physicalItem: PhysicalRollCopy
    private originalEvents: AnyRollEvent[]
    private modifiedEvents: AnyRollEvent[]
    measurements: MeasurementEvent[]
    conditionAssessments: ConditionAssessment[]
    editings: ManualEditing[]

    stretch?: Stretch
    shift?: Shift
    conjectures: Conjecture[]
    handAssignments: HandAssignment[]

    constructor() {
        this.physicalItem = {
            id: v4(),
            hasType: '',
            catalogueNumber: '',
            rollDate: ''
        }
        this.originalEvents = []
        this.conditionAssessments = []
        this.conjectures = []
        this.editings = []
        this.measurements = []
        this.modifiedEvents = []
        this.handAssignments = []
    }

    setRollType(type: 'welte-red') {
        this.physicalItem.hasType = `https://linked-rolls.org/skos/${type}`
    }

    readFromStanfordAton(atonString: string, adjustByRewind: boolean = true) {
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
        let averagePunchDiameter = -1

        this.setRollType(json.ROLLINFO.ROLL_TYPE)

        const lastHole = +holes[holes.length - 1].TRACKER_HOLE
        const rewindShift = adjustByRewind ? 91 - lastHole : 0
        const midiShift = typeToKey('Rewind')! - lastHole

        let circularPunches = 0
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

            const noteAttack = +hole.NOTE_ATTACK.replace('px', '') - 10
            const offset = +hole.OFF_TIME.replace('px', '')
            const height = offset - noteAttack + 20
            const column = +hole.ORIGIN_COL.replace('px', '') - 10;
            const columnWidth = +hole.WIDTH_COL.replace('px', '') + 20;

            const dimension: EventSpan = {
                hasUnit: 'mm',
                from: pixelsToMillimeters(noteAttack, dpi),
                to: pixelsToMillimeters(offset, dpi)
            }

            const annotates = `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`

            if (midiKey <= 23 || midiKey >= 104) {
                const type = keyToType(midiKey)
                if (!type) {
                    console.log('unknown expression key', midiKey, 'encountered. Ignoring.')
                    continue
                }

                const scope = midiKey <= 23 ? 'bass' : 'treble'

                this.originalEvents.push({
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
                this.originalEvents.push({
                    type: 'note',
                    id: v4(),
                    annotates: `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`,
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

        this.measurements.push({
            id: v4(),
            measured: this.physicalItem,
            hasCreated: {
                info: {
                    druid,
                    iiifLink: `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`,
                    dpi,
                    holeSeparation,
                    margins: {
                        treble: hardMarginTreble,
                        bass: hardMarginBass
                    },
                    rollWidth,
                    averagePunchDiameter,
                    // punchPattern: 'regular' | ''
                },
                events: this.originalEvents
            },
            usedSoftware: 'https://github.com/pianoroll/roll-image-parser',
            hasTimeSpan: {
                id: v4(),
                atSomeTimeWithin: date
            }
        })

        this.calculateModifiedEvents()
    }

    assessCondition(state: Omit<ConditionState, 'isConditionOf'>, actor: string) {
        this.conditionAssessments.push({
            id: v4(),
            carriedOutBy: actor,
            hasTimeSpan: { 'id': v4(), atSomeTimeWithin: 'now' },
            hasIdentified: {
                ...state,
                isConditionOf: this.physicalItem
            }
        })
    }

    addManualEditing(editing: ManualEditing) {
        this.editings.push(editing)
    }

    applyActions(actions: AnyEditorialAction[]) {
        let didChange = false
        for (const action of actions) {
            if (action.type === 'stretch' && action.copy === this.id) {
                this.stretch = action
                didChange = true
            }
            else if (action.type === 'shift' && action.copy === this.id) {
                this.shift = action
                didChange = true
            }
            else if (action.type === 'conjecture' && action.replaced.every(e => this.hasEventId(e.id))) {
                this.conjectures.push(action)
                didChange = true
            }
            else if (action.type === 'handAssignment' && action.assignedTo.every(e => this.hasEventId(e.id))) {
                this.handAssignments.push(action)
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
        this.modifiedEvents = structuredClone(this.originalEvents)

        if (this.stretch) applyStretch(this.stretch, this.modifiedEvents)
        if (this.shift) applyShift(this.shift, this.modifiedEvents)

        for (const conjecture of this.conjectures) {
            applyConjecture(conjecture, this.modifiedEvents)
        }

        this.modifiedEvents.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)
    }

    get events() {
        return this.modifiedEvents
    }

    set events(newEvents: AnyRollEvent[]) {
        this.originalEvents = newEvents
        this.calculateModifiedEvents()
    }

    insertEvent(event: AnyRollEvent) {
        this.originalEvents.push(event)
        this.originalEvents.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)
        this.calculateModifiedEvents()
    }

    removeEvent(eventId: string) {
        const index = this.originalEvents.findIndex(e => e.id === eventId)
        if (index === -1) return
        this.originalEvents.splice(index, 1)
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
            || this.originalEvents.findIndex(e => e.id === id) !== -1
    }

    get id() {
        return this.physicalItem.id
    }

    set id(newId: string) {
        this.physicalItem.id = newId
    }

    removeEditorialAction(action: AnyEditorialAction) {
        // TODO
        console.log(action)
    }

    get actions() {
        const result: AnyEditorialAction[] = [
            ...this.handAssignments,
            ...this.conjectures,
        ]

        if (this.stretch) result.push(this.stretch)
        if (this.shift) result.push(this.shift)

        return result
    }
}
