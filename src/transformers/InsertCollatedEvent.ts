import { AnyRollEvent, CollatedEvent } from "../types";
import { AnyRollEventNode, BodyNode, CollatedEventNode, RdgNode } from "./Node";
import { Transformer } from "./Transformer";

export const rollEventAsNode = (event: AnyRollEvent, parent: CollatedEventNode): AnyRollEventNode => {
    const result: any = {
        ...event,
        xmlId: event.id,
        parent,
        children: undefined
    }
    delete result.id 
    return result
}

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
            rollEventAsNode(rollEvent, eventNode)
        )

        return eventNode
    }
}
