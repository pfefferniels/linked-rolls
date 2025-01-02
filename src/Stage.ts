import { v4 } from "uuid";
import { CollationResult } from "./Collator";
import { Edit, ObjectUsage, Stage } from "./EditorialActions";

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

    fillEdits(usingCollation: CollationResult) {
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
                    action: 'delete',
                    argumentation: {
                        actor: '#collation-tool',
                        premises: [`
                            The event is included in at least one of the witnesses of the assumed 
                            ancestor, but not in any of the witnesses of the current stage.`]
                    }, 
                    certainty: 'true',
                    type: 'edit',
                    id: v4(),
                    contains: [collatedEvent]
                })
            }
            else if (containedInWitnesses && !containedInAncestor) {
                // that's an insert
                this.edits.push({
                    action: 'insert',
                    argumentation: {
                        actor: '#collation-tool',
                        premises: [`
                            The event is included in at least one of the witnesses of the current 
                            stage, but not in any of the witnesses of the assumed ancestor.`]
                    },
                    certainty: 'true',
                    type: 'edit',
                    id: v4(),
                    contains: [collatedEvent]
                })
            }
        }
    }
}

