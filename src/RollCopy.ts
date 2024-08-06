import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { AnyRollEvent, Assumption, ConditionAssessment, ConditionState, EventSpan, Expression, ManualEditing, MeasurementEvent, Note, PhysicalRollCopy, Shifting, Stretching } from "./types";

export type Operation = Shifting | Stretching

export class RollCopy {
    physicalItem: PhysicalRollCopy
    events: AnyRollEvent[]
    measurement?: MeasurementEvent
    conditionAssessments: ConditionAssessment[]
    editings: ManualEditing[]
    operations: (Shifting | Stretching)[]

    constructor() {
        this.physicalItem = {
            id: v4(),
            hasType: '',
            catalogueNumber: '',
            rollDate: ''
        }
        this.events = []
        this.conditionAssessments = []
        this.operations = []
        this.editings = []
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
        const date = json.ROLLINFO.ANALYSIS_DATE
        const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI.replace('ppi'))

        this.setRollType(json.ROLLINFO.ROLL_TYPE)

        const lastHole = +holes[holes.length - 1].TRACKER_HOLE
        const rewindShift = adjustByRewind ? 91 - lastHole : 0
        const midiShift = typeToKey('Rewind')! - lastHole

        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i]
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
                id: v4(),
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

                this.events.push({
                    type: 'expression',
                    id: v4(),
                    P2HasType: type,
                    hasScope: scope,
                    hasDimension: dimension,
                    annotates: annotates,
                    trackerHole
                } as Expression)
            }
            else {
                this.events.push({
                    type: 'note',
                    id: v4(),
                    annotates: `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`,
                    hasDimension: {
                        id: v4(),
                        hasUnit: 'mm',
                        from: pixelsToMillimeters(noteAttack, dpi),
                        to: pixelsToMillimeters(offset, dpi)
                    },
                    hasPitch: midiKey,
                    trackerHole
                } as Note)
            }
        }

        this.measurement = {
            id: v4(),
            measured: this.physicalItem,
            hasCreated: this.events,
            usedSoftware: 'https://github.com/pianoroll/roll-image-parser',
            hasTimeSpan: {
                id: v4(),
                atSomeTimeWithin: date
            }
        }
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

    applyOperations(ops: Operation[]) {
        for (const operation of ops) {
            for (const event of this.events) {
                if (operation.type === 'stretching') {
                    event.hasDimension.from *= (operation as Stretching).factor
                    event.hasDimension.to *= (operation as Stretching).factor
                }
                else if (operation.type === 'shifting') {
                    event.hasDimension.from += (operation as Shifting).horizontal
                    event.hasDimension.to += (operation as Shifting).horizontal
                    event.trackerHole += (operation as Shifting).vertical
                }
            }
        }
        this.operations.push(...ops)
    }

    addManualEditing(editing: ManualEditing) {
        this.editings.push(editing)
    }

    undoOperations() {
        for (const operation of this.operations) {
            for (const event of this.events) {
                if (operation.type === 'shifting') {
                    event.hasDimension.from -= (operation as Shifting).horizontal
                    event.hasDimension.to -= (operation as Shifting).horizontal
                    event.trackerHole -= (operation as Shifting).vertical
                }
                else if (operation.type === 'stretching') {
                    event.hasDimension.from /= (operation as Stretching).factor
                    event.hasDimension.to /= (operation as Stretching).factor
                }
            }
        }
        this.operations = []
    }

    /**
     * When working with roll copies, e. g. when doing a 
     * collation, we sometimes want to modify the roll
     * (e. g. stretch it) without harming the original.
     */
    clone() {
        const clone = new RollCopy()
        clone.conditionAssessments = [...this.conditionAssessments]
        clone.events = [...this.events]
        clone.measurement = { ...this.measurement } as MeasurementEvent
        clone.physicalItem = { ...this.physicalItem }
        clone.editings = { ...this.editings }

        return clone
    }

    /**
     * This applies the given pre-collation assumptions 
     * referring to events on this roll copy.
     */
    withAppliedAssumptions(assumptions: Assumption[]): AnyRollEvent[] {
        const modifiedEvents = structuredClone(this.events)

        for (const assumption of assumptions) {
            if (assumption.type === 'separation') {
                if (!assumption.into.length) continue

                const index = modifiedEvents.findIndex(e => e.id === assumption.separated.id)
                if (index === -1) {
                    console.log('Ignoring assumption', assumption, 'since the separated element was not found')
                    continue
                }

                modifiedEvents.splice(index, 1)
                modifiedEvents.push(...assumption.into)
            }
            if (assumption.type === 'unification') {
                if (assumption.unified.length < 2) continue

                const onsets = assumption.unified.map(event => event.hasDimension.from)
                const offsets = assumption.unified.map(event => event.hasDimension.to)

                const beginning = Math.min(...onsets)
                const end = Math.max(...offsets)

                const firstEvent = modifiedEvents.find(e => e.id === assumption.unified[0].id)
                if (!firstEvent) {
                    console.log('The first event of', assumption.unified, 'was not found in the event list, ignoring it.')
                    continue
                }

                firstEvent.hasDimension.from = beginning
                firstEvent.hasDimension.to = end
                firstEvent.annotates = undefined

                // remove all remaining events
                for (let i = 1; i < assumption.unified.length; i++) {
                    const index = modifiedEvents.findIndex(e => e.id === assumption.unified[i].id)
                    modifiedEvents.splice(index, 1)
                }
            }
        }

        return modifiedEvents
    }

    hasEvent(otherEvent: AnyRollEvent) {
        return this.events.findIndex(e => e.id === otherEvent.id) !== -1
    }

    get id() {
        return this.physicalItem.id
    }

    set id(newId: string) {
        this.physicalItem.id = newId
    }
}
