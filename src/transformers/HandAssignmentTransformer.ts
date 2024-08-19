import { Transformer } from "./Transformer";
import { HandAssignment } from "../types";
import { find, AnyRollEventNode, isRollEventNode } from "./Node";

export class HandAssignmentTransformer extends Transformer<HandAssignment> {
    apply(assumption: HandAssignment) {
        if (!assumption.assignedTo.length) {
            console.log('Empty assumption passed to transformer')
            return
        }

        const sourceId = this.sourceOf(assumption.assignedTo[0].id)
        if (!sourceId) {
            console.log('Source of events to which a hand was assigned cannot be determined')
            return
        }

        this
            .wrapInRdg(assumption.assignedTo
                .map(event => find(this.body, event.id))
                .filter(event => event !== undefined && isRollEventNode(event)) as AnyRollEventNode[]
            ).forEach(rdg => {
                rdg.xmlId = assumption.id
                rdg.hand = [assumption.hand.id]
                rdg.source = [sourceId]
        })
    }
}

