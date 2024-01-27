import { createLdoDataset } from "ldo"
import { CollatedEvent, RelativePlacement, TempoAdjustment } from "./.ldo/rollo.typings"
import { RelativePlacementShapeType, TempoAdjustmentShapeType } from "./.ldo/rollo.shapeTypes"
import rdf from '@rdfjs/data-model'
import { v4 } from "uuid"

export type Assumption = RelativePlacement | TempoAdjustment

class PlacementMaker {
    assumption: RelativePlacement

    constructor(target: Assumption[]) {
        this.assumption = {
            placed: {
                type: { '@id': 'CollatedEvent' },
                wasCollatedFrom: []
            },
            relativeTo: [],
            withPlacementType: { '@id': 'P176StartsBeforeTheStartOf' },
            type: { '@id': 'RelativePlacement' }
        }
        target.push(this.assumption)
    }

    where(event: CollatedEvent) {
        this.assumption.placed = event
        return this
    }

    startsBeforeTheStartOf(otherEvent: CollatedEvent) {
        this.assumption.withPlacementType = {
            '@id': 'P176StartsBeforeTheStartOf'
        };
        this.assumption.relativeTo.push(otherEvent)
    }

    startsBeforeTheEndOf(otherEvent: CollatedEvent) {
        this.assumption.withPlacementType = {
            '@id': 'P174StartsBeforeTheEndOf'
        };
        this.assumption.relativeTo.push(otherEvent)
    }
}

class TempoAdjustor {
    adjustment: TempoAdjustment

    constructor(target: Assumption[]) {
        this.adjustment = {
            adjusts: '',
            startsWith: 0,
            endsWith: 0,
            type: { '@id': 'TempoAdjustment' }
        }
        target.push(this.adjustment)
    }

    adjusts(target: string) {
        this.adjustment.adjusts = target
    }

    startsWith(start: number) {
        this.adjustment.startsWith = start
    }

    endsWith(end: number) {
        this.adjustment.endsWith = end
    }
}

export class Editor {
    assumptions: Assumption[] = []

    makePlacement() {
        return new PlacementMaker(this.assumptions)
    }

    adjustTempo() {
        return new TempoAdjustor(this.assumptions)
    }

    asDataset(baseURI: string) {
        // return assumptions as RDF dataset
        const dataset = createLdoDataset()
        dataset.startTransaction()
        for (const assumption of this.assumptions) {
            if (assumption.type?.["@id"] === 'RelativePlacement') {
                const placement = assumption as RelativePlacement
                const entity = dataset.usingType(RelativePlacementShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4()}`))
                entity.type = placement.type
                entity.placed = placement.placed
                entity.relativeTo = placement.relativeTo
                entity.withPlacementType = placement.withPlacementType
            }
            else if (assumption.type?.["@id"] === 'TempoAdjustment') {
                const adjustment = assumption as TempoAdjustment
                const entity = dataset.usingType(TempoAdjustmentShapeType).fromSubject(rdf.namedNode(`${baseURI}#${v4()}`))
                entity.type = adjustment.type
                entity.adjusts = adjustment.adjusts
                entity.startsWith = adjustment.startsWith
                entity.endsWith = adjustment.endsWith
            }
        }

        return dataset
    }
}
