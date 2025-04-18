import { v4 } from "uuid";
import { CollatedEvent, Collation } from "./Collation";
import { Edit, ObjectUsage, Stage } from "./EditorialAssumption";
import { RollCopy } from "./RollCopy";

/**
 * Stage Assumption = F28 Expression Creation
 */
export class StageCreation {
    created: Stage; // R17 created
    basedOn: ObjectUsage; // P140i was attributed by
    edits: Edit[]; // P9 consists of

    constructor(stage: Stage, basedOn: ObjectUsage) {
        this.created = stage
        this.basedOn = basedOn
        this.edits = []
    }

    get actions() {
        return [...this.edits, this.basedOn]
    }

    fillEdits(usingCollation: Collation) {
        if (!('witnesses' in this.basedOn.original)) return

        // inserts: collated events that contain events
        // belonging to witnesses of the current stage,
        // but do not contain any events belonging 
        // to witnesses of the previous stage.
        for (const collatedEvent of usingCollation.events) {
            let containedInWitnesses = collatedEvent.wasCollatedFrom.some(rollEvent =>
                this.created.witnesses.some(witness => witness.hasEvent(rollEvent))
            )

            let containedInAncestor = collatedEvent.wasCollatedFrom.some(rollEvent => (
                (this.basedOn.original as Stage).witnesses.some(witness => witness.hasEvent(rollEvent))
            ))

            if (!containedInWitnesses && containedInAncestor) {
                // that's a remove
                this.edits.push({
                    argumentation: {
                        actor: '#collation-tool',
                        premises: [this.basedOn],
                        adoptedBeliefs: [],
                        observations: [],
                    },
                    certainty: 'true',
                    type: 'edit',
                    id: v4(),
                    delete: [collatedEvent]
                })
            }
            else if (containedInWitnesses && !containedInAncestor) {
                // that's an insert
                this.edits.push({
                    argumentation: {
                        actor: '#collation-tool',
                        premises: [],
                        adoptedBeliefs: [],
                        observations: [],
                    },
                    certainty: 'true',
                    type: 'edit',
                    id: v4(),
                    insert: [collatedEvent]
                })
            }
        }
    }
}

export const findWitnessesWithinStage = (collatedEvent: CollatedEvent, within: Stage): Set<RollCopy> => {
    const witnessList = new Set<RollCopy>()
    for (const event of collatedEvent.wasCollatedFrom) {
        const witness = within.witnesses.find(witness => witness.hasEvent(event))
        if (witness) witnessList.add(witness)
    }
    return witnessList
}
