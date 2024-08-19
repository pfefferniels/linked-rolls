import { CollatedEvent } from "../types";
import { BodyNode, CollatedEventNode, RdgNode } from "./Node";
import { Transformer } from "./Transformer";

export class InsertCollatedEvent extends Transformer<CollatedEvent> {
    apply(event: CollatedEvent) {
        this.body.children.push(this.collatedEventAsNode(event, this.body))
    }

    private collatedEventAsNode(event: CollatedEvent, parent: RdgNode | BodyNode) {
        const eventNode: CollatedEventNode = {
            type: 'collatedEvent',
            parent,
            children: [],
            xmlId: event.id
        }
        eventNode.children = event.wasCollatedFrom.map(rollEvent =>
            this.rollEventAsNode(rollEvent, eventNode)
        )

        return eventNode
    }
}
