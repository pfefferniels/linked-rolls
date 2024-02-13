import { LdoDataset, createLdoDataset } from "ldo";
import { CollatedEvent, Collation, Expression, Note, Shifting, Stretching } from "./.ldo/rollo.typings";
import { RollCopy } from "./RollCopy";
import { CollatedEventShapeType, CollationShapeType, ShiftingShapeType, StretchingShapeType } from "./.ldo/rollo.shapeTypes";
import rdf from '@rdfjs/data-model'
import { v4 } from "uuid";
import { typeToKey } from "./keyToType";
import { RDF } from "@inrupt/vocab-common-rdf";
import { rolloContext } from "./.ldo/rollo.context";

export type Operation = Shifting | Stretching

const inRange = (range: [number, number], search: number) => {
    return search > range[0] && search < range[1]
}

export class Collator {
    rolls: RollCopy[] = []
    collatedRolls: string[] = []
    events: CollatedEvent[] = []
    operations: Operation[] = []
    baseURI: string = 'https://linked-rolls.org/'

    findCopy(itemUrl: string) {
        return this.rolls.find(copy => copy.physicalItem["@id"] === itemUrl)
    }

    shiftRollCopy(copy: RollCopy, horizontal: number, vertical: number) {
        const existingOperation = this.operations.find(operation =>
            operation.type["@id"] === 'Shifting' &&
            operation.P16UsedSpecificObject === copy.physicalItem)

        if (!existingOperation) {
            this.operations.push({
                '@id': `${this.baseURI}#${v4()}`,
                type: { '@id': 'Shifting' },
                'P16UsedSpecificObject': copy.physicalItem,
                horizontal,
                vertical
            })
            return
        }

        (existingOperation as Shifting).horizontal = horizontal;
        (existingOperation as Shifting).vertical = vertical;
    }

    stretchRollCopy(copy: RollCopy, factor: number) {
        const existingOperation = this.operations.find(operation =>
            operation.type["@id"] === 'Stretching' &&
            operation.P16UsedSpecificObject === copy.physicalItem)

        if (!existingOperation) {
            this.operations.push({
                '@id': `${this.baseURI}#${v4()}`,
                type: { '@id': 'Stretching' },
                'P16UsedSpecificObject': copy.physicalItem,
                factor
            })
            return
        }

        (existingOperation as Stretching).factor = factor;
    }

    addRoll(rollCopy: RollCopy) {
        const clonedCopy = rollCopy.clone()
        this.rolls.push(clonedCopy)

        return clonedCopy.physicalItem["@id"]
    }

    prepareFromRollCopy(rollCopy: RollCopy) {
        for (const event of rollCopy.events) {
            const newId = `${this.baseURI}#${v4()}`
            this.events.push({
                '@id': newId,
                type: { '@id': 'CollatedEvent' },
                wasCollatedFrom: [event]
            })
        }
        this.collatedRolls.push(rollCopy.physicalItem["@id"] || 'unknown')
    }

    applyOperations() {
        // make sure to apply shift operations after stretching
        this.operations.sort((a, b) => {
            if (a.type["@id"] === 'Shifting' && b.type["@id"] === 'Stretching')
                return 1;
            else return -1;
        })
        for (const operation of this.operations) {
            const affectedRoll = this.rolls.find(roll => roll.physicalItem["@id"] === operation.P16UsedSpecificObject["@id"])
            if (!affectedRoll) {
                console.log('Target of operation', operation, 'not found')
                continue
            }

            for (const event of affectedRoll?.events) {
                if (operation.type["@id"] === 'Stretching') {
                    event.P43HasDimension.from *= (operation as Stretching).factor
                    event.P43HasDimension.to *= (operation as Stretching).factor
                }
                else if (operation.type["@id"] === 'Shifting') {
                    event.P43HasDimension.from += (operation as Shifting).horizontal
                    event.P43HasDimension.to += (operation as Shifting).horizontal
                    event.trackerHole += (operation as Shifting).vertical
                }
            }
        }
    }

    undoOperations() {
        this.operations.sort((a, b) => {
            if (a.type["@id"] === 'Shifting' && b.type["@id"] === 'Stretching')
                return -1;
            else return 1;
        })
        for (const operation of this.operations) {
            const affectedRoll = this.rolls.find(roll => roll.physicalItem === operation.P16UsedSpecificObject)
            if (!affectedRoll) {
                console.log('Target of operation', operation, 'not found')
                continue
            }

            for (const event of affectedRoll?.events) {
                if (operation.type["@id"] === 'Shifting') {
                    event.P43HasDimension.from -= (operation as Shifting).horizontal
                    event.P43HasDimension.to -= (operation as Shifting).horizontal
                    event.trackerHole -= (operation as Shifting).vertical
                }
                else if (operation.type["@id"] === 'Stretching') {
                    event.P43HasDimension.from /= (operation as Stretching).factor
                    event.P43HasDimension.to /= (operation as Stretching).factor
                }
            }
        }
    }

    private async collateWith(otherCopy: RollCopy) {
        type EventInfo = {
            onset: number
            offset: number
            pitch: number
            id: string
        }

        const myInfo: EventInfo[] = []
        for (const event of this.events) {
            if (!event.wasCollatedFrom || event.wasCollatedFrom.length === 0) continue

            const pitch = event.wasCollatedFrom[0].type?.["@id"] === 'Note'
                ? (event.wasCollatedFrom[0] as Note).hasPitch
                : typeToKey((event.wasCollatedFrom[0] as Expression).P2HasType['@id']) || 0
            myInfo.push({
                id: event["@id"] || `${this.baseURI}#${v4()}`,
                onset: event.wasCollatedFrom.reduce((acc, current) => acc + current.P43HasDimension.from, 0) / event.wasCollatedFrom.length,
                offset: event.wasCollatedFrom.reduce((acc, current) => acc + current.P43HasDimension.to, 0) / event.wasCollatedFrom.length,
                pitch
            })
        }
        myInfo.sort((a, b) => a.onset - b.onset)

        const otherInfo: EventInfo[] = otherCopy.events.map(e => {
            const pitch = e.type?.["@id"] === 'Note'
                ? (e as Note).hasPitch
                : typeToKey((e as Expression).P2HasType['@id']) || 0
            return {
                id: e["@id"] || `${this.baseURI}#${v4()}`,
                onset: e.P43HasDimension.from,
                offset: e.P43HasDimension.to,
                pitch
            }
        })

        console.log(myInfo.map(info => info.onset))
        console.log(otherInfo.map(info => info.onset))

        for (const info of otherInfo) {
            // console.log('searching candidates for', info)
            // same pitch and approximately the same region?
            const candidates = myInfo.filter(i => {
                return (
                    i.pitch === info.pitch &&
                    inRange([i.onset - 5, i.onset + 5], info.onset) &&
                    inRange([i.offset - 5, i.offset + 5], info.offset))
            })

            if (!candidates.length) {
                console.log('no candidates found for', info.onset, ':', myInfo.filter(i => i.pitch === info.pitch), 'does not fit.')
                const correspEvent = otherCopy.events.find(e => e["@id"] === info.id)
                if (!correspEvent) {
                    console.log('This is not supposed to happen')
                    continue
                }

                this.events.push({
                    '@id': `${this.baseURI}#${v4()}`,
                    'type': { '@id': 'CollatedEvent' },
                    'wasCollatedFrom': [correspEvent]
                })
                continue
            }

            const diffs = candidates.map(i =>
                Math.abs(i.onset - info.onset) + Math.abs(i.onset - info.offset))
            const bestIndex = diffs.indexOf(Math.min(...diffs))
            const bestEvent = candidates[bestIndex]

            const me = otherCopy.events.find(e => e["@id"] === info.id)

            if (!me) {
                console.log('This is not supposed to happen')
                continue
            }

            this.events.find(e => e["@id"] === bestEvent.id)?.wasCollatedFrom?.push(me)
        }

        this.collatedRolls.push(otherCopy.physicalItem["@id"] || '')
    }


    async collateAllRolls() {
        console.log(this.rolls)
        for (let i = 1; i < this.rolls.length; i++) {
            this.collateWith(this.rolls[i])
        }
    }

    asDataset() {
        let dataset = createLdoDataset()
        dataset.startTransaction()

        for (const event of this.events) {
            dataset.usingType(CollatedEventShapeType).fromJson(event)
        }

        for (const op of this.operations) {
            if (op.type["@id"] === 'Shifting') {
                dataset.usingType(ShiftingShapeType).fromJson(op as Shifting)
            }
            else if (op.type["@id"] === 'Stretching') {
                dataset.usingType(StretchingShapeType).fromJson(op as Stretching)
            }
        }

        const collationActivity: Collation = {
            '@id': `${this.baseURI}#${v4()}`,
            'collated': this.rolls.map(roll => ({
                '@id': roll.physicalItem["@id"]!
            })),
            type: { '@id': 'C10Collation' }
        }

        dataset.usingType(CollationShapeType).fromJson(collationActivity)

        for (const roll of this.rolls) {
            dataset.addAll(roll.asDataset())
        }

        return dataset
    }

    async importFromDataset(dataset: LdoDataset) {
        this.events = []

        const eventQuads = dataset.match(null, rdf.namedNode(RDF.type), rdf.namedNode(rolloContext.CollatedEvent as string))
        for (const quad of eventQuads) {
            const collatedEvent = dataset.usingType(CollatedEventShapeType).fromSubject(quad.subject.value)
            this.events.push(collatedEvent)
        }

        const shiftingQuads = dataset.match(null, rdf.namedNode(RDF.type), rdf.namedNode(rolloContext.Shifting as string))
        for (const quad of shiftingQuads) {
            const shifting = dataset.usingType(ShiftingShapeType).fromSubject(quad.subject.value)
            this.operations.push(shifting)
        }

        const stretchingQuads = dataset.match(null, rdf.namedNode(RDF.type), rdf.namedNode(rolloContext.Stretching as string))
        for (const quad of stretchingQuads) {
            const stretching = dataset.usingType(StretchingShapeType).fromSubject(quad.subject.value)
            this.operations.push(stretching)
        }

        this.rolls = []
        const collationQuad = dataset.match(null, rdf.namedNode(RDF.type), rdf.namedNode(rolloContext.Stretching as string))
        for (const quad of collationQuad) {
            const collation = dataset.usingType(CollationShapeType).fromSubject(quad.subject.value)
            if (!collation.collated) continue
            for (const physicalItem of collation.collated) {
                if (!physicalItem["@id"]) continue

                const rollCopy = new RollCopy(physicalItem['@id'])
                rollCopy.importFromDataset(dataset, physicalItem['@id'])
                this.rolls.push(rollCopy)
            }
        }
    }
}
