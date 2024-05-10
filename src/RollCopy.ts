import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { ConditionAssessment, ConditionState, EventSpan, Expression, MeasurementEvent, Note, PhysicalRollCopy, Shifting, Stretching } from "./types";

export type Operation = Shifting | Stretching

export class RollCopy {
    physicalItem: PhysicalRollCopy
    events: (Note | Expression)[]
    conditionAssessments: ConditionAssessment[]
    measurement?: MeasurementEvent
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
            hasCreated: this.events
        }
    }

    assessCondition(state: Omit<ConditionState, 'isConditionOf'>, actor: string) {
        this.conditionAssessments.push({
            id: v4(),
            carriedOutBy: actor,
            hasTimeSpan: { 'id': v4(), atSomeTimeWithin: 'now' },
            hasIndentified: {
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

        return clone
    }
}
