import { AtonParser } from "./aton/AtonParser";
import { ConditionAssessmentShapeType, ExpressionShapeType, NoteShapeType } from "./.ldo/rollo.shapeTypes";
import { ConditionAssessment, ConditionState, Expression, MeasurementEvent, Note, PhysicalRollCopy } from "./.ldo/rollo.typings";
import { createLdoDataset } from "ldo";
import rdf from "@rdfjs/data-model";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";

export class RollCopy {
    physicalItem: PhysicalRollCopy
    events: (Note | Expression)[]
    conditionAssessments: ConditionAssessment[]
    measurement?: MeasurementEvent

    constructor() {
        this.physicalItem = {
            P2HasType: 'welte-red',
            type: { '@id': 'F5Item' }
        }
        this.events = []
        this.conditionAssessments = []
    }

    setRollType(type: 'welte-red') {
        this.physicalItem.P2HasType = `https://linked-rolls.org/skos/${type}`
    }

    readFromStanfordAton(atonString: string) {
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
        const shift = typeToKey('Rewind')! - lastHole

        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i]
            if (!hole.NOTE_ATTACK || !hole.OFF_TIME) continue

            const midiKey = +hole.TRACKER_HOLE + shift
            // console.log('key=', midiKey)

            const noteAttack = +hole.NOTE_ATTACK.replace('px', '') - 10
            const offset = +hole.OFF_TIME.replace('px', '')
            const height = offset - noteAttack + 20
            const column = +hole.ORIGIN_COL.replace('px', '') - 10;
            const columnWidth = +hole.WIDTH_COL.replace('px', '') + 20;

            const dimension = {
                type: 'EventSpan',
                P91HasUnit: 'mm',
                from: pixelsToMillimeters(noteAttack, dpi),
                to: pixelsToMillimeters(offset, dpi)
            }

            const annotates = {
                '@id': `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`
            }

            if (midiKey <= 23 || midiKey >= 104) {
                const type = keyToType(midiKey)
                if (!type) {
                    console.log('unknown expression key', midiKey, 'encountered. Ignoring.')
                    continue
                }

                const scope = midiKey <= 23 ? 'bass' : 'treble'

                this.events.push({
                    '@id': v4(),
                    'type': 'Expression',
                    'P2HasType': { '@id': type as any },
                    'hasScope': { '@id': scope },
                    P43HasDimension: dimension,
                    L43Annotates: annotates
                })
            }
            else {
                this.events.push({
                    '@id': v4(),
                    'type': 'Note',
                    L43Annotates: {
                        '@id': `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`
                    },
                    P43HasDimension: {
                        type: 'EventSpan',
                        P91HasUnit: 'mm',
                        from: pixelsToMillimeters(noteAttack, dpi),
                        to: pixelsToMillimeters(offset, dpi)
                    },
                    hasPitch: midiKey
                })
            }
        }

        this.measurement = {
            type: { '@id': 'D11DigitalMeasurementEvent' },
            P39Measured: this.physicalItem,
            L20HasCreated: this.events
        }
    }

    assessCondition(state: Omit<ConditionState, 'P44iIsConditionOf'>, actor: string) {
        this.conditionAssessments.push({
            P14CarriedOutBy: { '@id': actor },
            type: { '@id': 'E14ConditionAssessment' },
            P4HasTimeSpan: { P82AtSomeTimeWithin: 'now', 'type': { '@id': 'E52TimeSpan' } },
            P35HasIdentified: {
                ...state,
                P44iIsConditionOf: this.physicalItem
            }
        })
    }

    asDataset(baseURI: string) {
        const dataset = createLdoDataset()
        dataset.startTransaction()
        for (const event of this.events) {
            if (event.type === 'Expression') {
                const entity = dataset.usingType(ExpressionShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4()}`))
                entity.L43Annotates = event.L43Annotates
                entity.P43HasDimension = event.P43HasDimension
                entity.P2HasType = (event as Expression).P2HasType
                entity.hasScope = (event as Expression).hasScope
                entity.type = event.type
            }
            else {
                const entity = dataset.usingType(NoteShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4()}`))
                entity.L43Annotates = event.L43Annotates
                entity.P43HasDimension = event.P43HasDimension
                entity.hasPitch = (event as Note).hasPitch
                entity.type = event.type
            }
        }

        for (const assessment of this.conditionAssessments) {
            const entity = dataset.usingType(ConditionAssessmentShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4}`))
            entity.P14CarriedOutBy = assessment.P14CarriedOutBy
            entity.P35HasIdentified = assessment.P35HasIdentified
            entity.P4HasTimeSpan = assessment.P4HasTimeSpan
            entity.type = assessment.type
        }

        return dataset
    }
}
