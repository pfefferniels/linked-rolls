import { v4 } from "uuid";
import { Symbol, Collation } from "./Collation";
import { AnyEditorialAssumption, Edit, Intention, Derivation, Stage } from "./EditorialAssumption";
import { RollCopy } from "./RollCopy";

/**
 * Stage Assumption = F28 Expression Creation
 */
export class StageCreation {
    created: Stage; // R17 created
    basedOn?: Derivation; // if no derivation is defined, it is assumed that this stage represents the mother roll
    edits: Edit[]; // P9 consists of
    intentions: Intention[]

    constructor(stage: Stage, basedOn?: Derivation) {
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
        if (!this.basedOn) return

        // inserts: collated events that contain events
        // belonging to witnesses of the current stage,
        // but do not contain any events belonging 
        // to witnesses of the previous stage.
        for (const collatedEvent of usingCollation.events) {
            let containedInWitnesses = collatedEvent.isCarriedBy.some(rollEvent =>
                this.created.witnesses.some(witness => witness.hasEvent(rollEvent))
            )

            let containedInAncestor = collatedEvent.isCarriedBy.some(rollEvent => (
                this.basedOn!.original.witnesses.some(witness => witness.hasEvent(rollEvent))
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

export const findWitnessesWithinStage = (collatedEvent: Symbol, within: Stage): Set<RollCopy> => {
    const witnessList = new Set<RollCopy>()
    for (const event of collatedEvent.isCarriedBy) {
        const witness = within.witnesses.find(witness => witness.hasEvent(event))
        if (witness) witnessList.add(witness)
    }
    return witnessList
}
