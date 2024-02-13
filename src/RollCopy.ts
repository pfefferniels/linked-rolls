import { AtonParser } from "./aton/AtonParser";
import { ExpressionShapeType, MeasurementEventShapeType, NoteShapeType, PhysicalRollCopyShapeType } from "./.ldo/rollo.shapeTypes";
import { ConditionAssessment, ConditionState, EventSpan, Expression, MeasurementEvent, Note, PhysicalRollCopy } from "./.ldo/rollo.typings";
import { LdoDataset, createLdoDataset } from "ldo";
import { v4 } from "uuid";
import { keyToType, typeToKey } from "./keyToType";
import { rolloContext } from "./.ldo/rollo.context";
import rdf from '@rdfjs/data-model'
import { RDF } from "@inrupt/vocab-common-rdf";

export class RollCopy {
    physicalItem: PhysicalRollCopy
    events: (Note | Expression)[]
    conditionAssessments: ConditionAssessment[]
    measurement?: MeasurementEvent
    baseURI: string = 'https://linked-rolls.org/'

    constructor(attachToItem?: string) {
        this.physicalItem = {
            '@id': attachToItem,
            P2HasType: 'welte-red',
            type: { '@id': 'F5Item' }
        }
        this.events = []
        this.conditionAssessments = []
    }

    setRollType(type: 'welte-red') {
        this.physicalItem.P2HasType = `https://linked-rolls.org/skos/${type}`
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
                '@id': `${this.baseURI}#${v4()}`,
                type: { '@id': 'EventSpan' },
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
                    '@id': `${this.baseURI}#${v4()}`,
                    'type': { '@id': 'Expression' },
                    'P2HasType': { '@id': type as any },
                    'hasScope': { '@id': scope },
                    P43HasDimension: dimension,
                    L43Annotates: annotates,
                    trackerHole
                })
            }
            else {
                this.events.push({
                    '@id': `${this.baseURI}#${v4()}`,
                    'type': { '@id': 'Note' },
                    L43Annotates: {
                        '@id': `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${noteAttack},${columnWidth},${height}/128,/0/default.jpg`
                    },
                    P43HasDimension: {
                        '@id': `${this.baseURI}#${v4()}`,
                        type: { '@id': 'EventSpan' },
                        P91HasUnit: 'mm',
                        from: pixelsToMillimeters(noteAttack, dpi),
                        to: pixelsToMillimeters(offset, dpi)
                    },
                    hasPitch: midiKey,
                    trackerHole
                })
            }
        }

        this.measurement = {
            '@id': `${this.baseURI}#${v4()}`,
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

    asDataset() {
        console.log('before exporting:', this.measurement)
        const dataset = createLdoDataset()
        dataset.startTransaction()
        for (const event of this.events) {
            if (event.type?.["@id"] === 'Expression') {
                dataset.usingType(ExpressionShapeType).fromJson(event as Expression)
            }
            else {
                dataset.usingType(NoteShapeType).fromJson(event as Note)
            }
        }

        dataset.usingType(PhysicalRollCopyShapeType).fromJson(this.physicalItem)
        if (this.measurement) {
            dataset.usingType(MeasurementEventShapeType).fromJson(this.measurement)
        }

        return dataset
    }

    async importFromDataset(dataset: LdoDataset, physicalItemId: string) {
        this.events = []

        const measurements = dataset.match(
            null,
            rdf.namedNode((rolloContext.P39Measured as any)['@id'] as string),
            rdf.namedNode(physicalItemId))

        for (const measurementMatch of measurements) {
            this.measurement = dataset.usingType(MeasurementEventShapeType).fromSubject(measurementMatch.subject.value)
        }

        const links = this.measurement?.L20HasCreated
        if (!links) return

        for (const link of links) {
            if (!link['@id']) continue

            console.log('link id=', link['@id'])
            const noteQuads = dataset.match(
                rdf.namedNode(link["@id"]),
                rdf.namedNode(RDF.type),
                rdf.namedNode(rolloContext.Note as string))

            for (const quad of noteQuads) {
                const event = dataset.usingType(NoteShapeType).fromSubject(quad.subject.value)
                this.events.push(event)
            }

            const expressionQuads = dataset.match(
                rdf.namedNode(link["@id"]),
                rdf.namedNode(RDF.type),
                rdf.namedNode(rolloContext.Expression as string))
            for (const quad of expressionQuads) {
                const event = dataset.usingType(ExpressionShapeType).fromSubject(quad.subject.value)
                this.events.push(event)
            }
        }

        console.log('event size=', this.events)
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
