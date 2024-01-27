import { CollatedEvent, RelativePlacement, TempoAdjustment } from "./.ldo/rollo.typings"

export type Assumption = RelativePlacement | TempoAdjustment

class PlacementMaker {
    assumption: RelativePlacement

    constructor(target: Assumption[]) {
        this.assumption = {
            placed: {
                type: 'CollatedEvent',
                wasCollatedFrom: []
            },
            relativeTo: [],
            withPlacementType: { '@id': 'P176StartsBeforeTheStartOf' },
            type: 'RelativePlacement'
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
    target: Assumption[]

    constructor(target: Assumption[]) {
        this.target = target
    }
}

export class Editor {
    assumptions: Assumption[] = []

    makePlacement() {
        return new PlacementMaker(this.assumptions)
    }

    asDataset(baseURI: string) {
        // return assumptions as RDF dataset
    }
}
