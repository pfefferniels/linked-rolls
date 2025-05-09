import { v4 } from "uuid";
import { CollatedEvent, Collation } from "./Collation";
import { AnyEditorialAssumption, Edit, Intention, ObjectUsage, Stage } from "./EditorialAssumption";
import { RollCopy } from "./RollCopy";

/**
 * Stage Assumption = F28 Expression Creation
 */
export class StageCreation {
    created: Stage; // R17 created
    basedOn: ObjectUsage; // P140i was attributed by
    edits: Edit[]; // P9 consists of
    intentions: Intention[]

    constructor(stage: Stage, basedOn: ObjectUsage) {
        this.created = stage
        this.basedOn = basedOn
        this.edits = []
        this.intentions = []
    }

    get actions() {
        return [...this.intentions, ...this.edits, this.basedOn]
    }

    removeEditorialAction(action: AnyEditorialAssumption) {
        this.intentions = this.intentions.filter(a => a !== action)
        this.edits = this.edits.filter(a => a !== action)
        
        this.created.witnesses.forEach(witness => {
            witness.removeEditorialAction(action)
        })
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
                    reasons: [{
                        type: 'inference',
                        actor: '#collation-tool',
                        premises: [this.basedOn]
                    }],
                    certainty: 'true',
                    type: 'edit',
                    id: v4(),
                    delete: [collatedEvent]
                })
            }
            else if (containedInWitnesses && !containedInAncestor) {
                // that's an insert
                this.edits.push({
                    reasons: [{
                        type: 'inference',
                        actor: '#collation-tool',
                        premises: [this.basedOn]
                    }],
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
