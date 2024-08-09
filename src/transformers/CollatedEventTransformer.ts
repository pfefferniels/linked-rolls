import { v4 } from "uuid";
import { AnyRollEvent, CollatedEvent } from "../types";
import { AnyEventNode, AppNode, BodyNode, CollatedEventNode, RdgNode } from "./Node";
import { Transformer } from "./Transformer";

export const rollEventAsNode = (event: AnyRollEvent, parent: CollatedEventNode): AnyEventNode => {
    return {
        ...event,
        xmlId: event.id,
        parent,
        children: undefined
    }
}

export class CollatedEventTransfromer extends Transformer<CollatedEvent> {
    apply(event: CollatedEvent) {
        const allSources = this.sources.map(s => s.id).sort()
        const eventSources = Array.from(this.sourcesOf(event)).sort()

        const missing = allSources.filter(source => eventSources.indexOf(source) < 0);

        if (!allSources.every((source, index) => source === eventSources[index])) {
            // there isn't an event for every source => create apparatus first
            const appNode: AppNode = {
                type: 'app',
                parent: this.body,
                children: [],
                xmlId: v4()
            }

            // combine those sources that are missing from the collated event
            // into one reading
            const rdgNode: RdgNode = {
                type: 'rdg',
                parent: appNode,
                children: [],
                xmlId: v4(),
                source: missing
            }

            // combine all other into the other reading
            const otherRdgNode: RdgNode = {
                type: 'rdg',
                parent: appNode,
                children: [],
                source: eventSources,
                xmlId: v4()
            }

            rdgNode.children.push(this.collatedEventAsNode(event, otherRdgNode))
            appNode.children = [rdgNode, otherRdgNode]
            this.body.children.push(appNode)
        }
        else {
            this.body.children.push(this.collatedEventAsNode(event, this.body))
        }
    }

    sourcesOf(event: CollatedEvent) {
        const result: Set<string> = new Set()

        for (const copyEvent of event.wasCollatedFrom) {
            const sourceLink = this.sourceOf(copyEvent.id)
            if (!sourceLink) continue

            result.add(sourceLink)
        }

        return result
    }

    private collatedEventAsNode(event: CollatedEvent, parent: RdgNode | BodyNode) {
        const eventNode: CollatedEventNode = {
            type: 'collatedEvent',
            parent,
            children: [],
            xmlId: v4()
        }
        eventNode.children = event.wasCollatedFrom.map(rollEvent =>
            rollEventAsNode(rollEvent, eventNode)
        )

        return eventNode
    }
}
