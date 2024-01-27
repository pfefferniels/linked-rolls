import { createLdoDataset } from "ldo";
import { CollatedEvent, Expression, Note } from "./.ldo/rollo.typings";
import { RollCopy } from "./RollCopy";
import { CollatedEventShapeType } from "./.ldo/rollo.shapeTypes";
import rdf from '@rdfjs/data-model'
import { v4 } from "uuid";
import { alignMidiToMidi } from "alignmenttool"
import { MidiNote } from "alignmenttool/lib/Matcher";
import { typeToKey } from "./keyToType";

export class Collator {
    events: CollatedEvent[]

    constructor() {
        this.events = []
    }

    prepareFromRollCopy(rollCopy: RollCopy) {
        this.events = rollCopy.events.map(event => {
            return {
                '@id': v4(),
                type: { '@id': 'CollatedEvent' },
                wasCollatedFrom: [event]
            }
        })
    }

    async collateWith(otherCopy: RollCopy) {
        const myEvents: MidiNote[] = []
        for (const event of this.events) {
            if (!event.wasCollatedFrom || event.wasCollatedFrom.length === 0) continue

            const pitch = event.wasCollatedFrom[0].type?.["@id"] === 'Note'
                ? (event.wasCollatedFrom[0] as Note).hasPitch
                : typeToKey((event.wasCollatedFrom[0] as Expression).P2HasType['@id']) || 0
            myEvents.push({
                id: event["@id"] || v4(),
                onset: event.wasCollatedFrom.reduce((acc, current) => acc + current.P43HasDimension.from, 0) / event.wasCollatedFrom.length / 10,
                offset: event.wasCollatedFrom.reduce((acc, current) => acc + current.P43HasDimension.to, 0) / event.wasCollatedFrom.length / 10,
                pitch,
                channel: pitch < 60 ? 0 : 1
            })
        }

        const otherEvents: MidiNote[] = []
        for (const event of otherCopy.events) {
            const pitch = event.type?.["@id"] === 'Note'
                ? (event as Note).hasPitch
                : typeToKey((event as Expression).P2HasType['@id']) || 0
            otherEvents.push({
                id: event["@id"] || v4(),
                onset: event.P43HasDimension.from / 10,
                offset: event.P43HasDimension.to / 10,
                pitch,
                channel: pitch < 60 ? 0 : 1
            })
        }

        const matchResult = await alignMidiToMidi(myEvents, otherEvents, 0.001)
        const matches = matchResult.matches;
        for (let i = 0; i < matches.size(); i++) {
            const match = matches.get(i);

            const myEvent = this.events.find(event => event["@id"] === match.scoreId)
            const otherEvent = otherCopy.events.find(event => event["@id"] === match.midiId)

            // TODO: check match status and error index 

            if (!myEvent && otherEvent) {
                this.events.push({
                    type: { '@id': 'CollatedEvent' },
                    wasCollatedFrom: [otherEvent]
                })
                return
            }

            if (myEvent && otherEvent) {
                if (!myEvent.wasCollatedFrom) myEvent.wasCollatedFrom = []
                myEvent.wasCollatedFrom.push(otherEvent)
            }
        }
    }

    asDataset(baseURI: string) {
        const dataset = createLdoDataset()
        dataset.startTransaction()
        for (const event of this.events) {
            const entity = dataset.usingType(CollatedEventShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4()}`))
            entity.type = event.type
            entity.wasCollatedFrom = event.wasCollatedFrom
            entity.isNonMusical = event.isNonMusical
        }

        return dataset
    }
}
