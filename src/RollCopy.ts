import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { AnyRollEvent, Assumption, ConditionAssessment, ConditionState, EventSpan, Expression, ManualEditing, MeasurementEvent, Note, PhysicalRollCopy, Shifting, Stretching } from "./types";

export type Operation = Shifting | Stretching

export class RollCopy {
    physicalItem: PhysicalRollCopy
    events: AnyRollEvent[]
    measurements: MeasurementEvent[]
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
        this.measurements = []
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

                this.events.push({
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
                this.events.push({
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
                events: this.events
            },
            usedSoftware: 'https://github.com/pianoroll/roll-image-parser',
            hasTimeSpan: {
                id: v4(),
                atSomeTimeWithin: date
            }
        })
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
                    event.hasDimension.horizontal.from *= (operation as Stretching).factor
                    if (event.hasDimension.horizontal.to) {
                        event.hasDimension.horizontal.to *= (operation as Stretching).factor
                    }
                }
                else if (operation.type === 'shifting') {
                    const shifting = (operation as Shifting)
                    event.hasDimension.horizontal.from += shifting.horizontal
                    if (event.hasDimension.horizontal.to) {
                        event.hasDimension.horizontal.to += shifting.horizontal
                    }

                    event.hasDimension.vertical.from += shifting.vertical
                    if (event.hasDimension.vertical.to) {
                        event.hasDimension.vertical.to += shifting.vertical
                    }
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
                    const shifting = (operation as Shifting)
                    event.hasDimension.horizontal.from -= shifting.horizontal

                    if (event.hasDimension.horizontal.to) {
                        event.hasDimension.horizontal.to -= shifting.horizontal
                    }

                    event.hasDimension.vertical.from -= shifting.vertical
                    if (event.hasDimension.vertical.to) {
                        event.hasDimension.vertical.from -= shifting.vertical
                    }
                }
                else if (operation.type === 'stretching') {
                    const stretching = (operation as Stretching)

                    event.hasDimension.horizontal.from /= stretching.factor

                    if (event.hasDimension.horizontal.to) {
                        event.hasDimension.horizontal.to /= stretching.factor
                    }
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
        clone.conditionAssessments = structuredClone(this.conditionAssessments)
        clone.events = structuredClone(this.events)
        clone.measurements = structuredClone(this.measurements)
        clone.physicalItem = structuredClone(this.physicalItem)
        clone.editings = structuredClone(this.editings)

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

                const onsets = assumption.unified.map(event => event.hasDimension.horizontal.from)
                const offsets = assumption.unified.map(event => event.hasDimension.horizontal.to!)

                const beginning = Math.min(...onsets)
                const end = Math.max(...offsets)

                const firstEvent = modifiedEvents.find(e => e.id === assumption.unified[0].id)
                if (!firstEvent) {
                    console.log('The first event of', assumption.unified, 'was not found in the event list, ignoring it.')
                    continue
                }

                firstEvent.hasDimension.horizontal.from = beginning
                firstEvent.hasDimension.horizontal.to = end
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

    hasEventId(id: string) {
        return this.events.findIndex(e => e.id === id) !== -1
    }

    get id() {
        return this.physicalItem.id
    }

    set id(newId: string) {
        this.physicalItem.id = newId
    }
}
