import { v4 } from "uuid";
import { Transformer } from "./Transformer";
import { HandAssignment } from "../types";
import { AppNode, findAncestor, CollatedEventNode, find, RdgNode } from "./Node";

export class HandAssignmentTransformer extends Transformer<HandAssignment> {
    apply(assumption: HandAssignment) {
        for (const assignedTo of assumption.assignedTo) {
            const affectedNode = find(this.body, assignedTo.id)
            if (!affectedNode) {
                console.log(`
                    The roll event ${assignedTo.id} was not found in the tree. 
                    Make sure that the HandAssignmentTransformer runs after
                    events have been inserted into the tree.`
                )
                continue
            }

            if (affectedNode.type !== 'note' && affectedNode.type !== 'expression') {
                console.log('Hand was assigned to an unsupported roll event type')
                continue
            }

            const collatedEvent: CollatedEventNode = affectedNode.parent

            const rdgNode = findAncestor(affectedNode, 'rdg') as RdgNode | undefined
            if (rdgNode) {
                // the roll event is already part of a reading. Take 
                // it out from the list of sources (unless it consists
                // only of that source) and separate it into a new reading
                const affectedSource = this.sourceOf(affectedNode.xmlId)
                if (!affectedSource) {
                    console.log('No source could be determined for roll event', affectedNode)
                    continue
                }

                const sourceIndex = rdgNode.source.findIndex(source => source === affectedSource)
                if (sourceIndex === -1) {
                    console.log(
                        `Roll event is part of a reading node, but its source
                        is not listed in the readings\' source attribute`
                    )
                    continue
                }
                rdgNode.source.splice(sourceIndex, 1)

                // Take it out from its original context 
                const eventIndex = collatedEvent.children.findIndex(e => e.xmlId === affectedNode.xmlId)
                if (eventIndex === -1) {
                    throw new Error("Event is not a child of its parent")
                }
                collatedEvent.children.splice(eventIndex, 1)

                const appNode = rdgNode.parent

                const newRdg: RdgNode = {
                    type: 'rdg',
                    xmlId: v4(),
                    children: [],
                    parent: appNode,
                    source: [affectedSource]
                }

                const newCollatedEvent: CollatedEventNode = {
                    type: 'collatedEvent',
                    parent: newRdg,
                    children: [affectedNode],
                    xmlId: v4(),
                }
                affectedNode.parent = newCollatedEvent
                newRdg.children = [newCollatedEvent]
                appNode.children.push(newRdg)
            }
            else {
                // this roll event is not yet marked as a reading. 
                // Take it out from its original context 
                const index = collatedEvent.children.findIndex(e => e.xmlId === affectedNode.xmlId)
                if (index === -1) {
                    throw new Error("Event is not a child of its parent")
                }
                collatedEvent.children.splice(index, 1)

                const appNode: AppNode = {
                    type: 'app',
                    xmlId: v4(),
                    parent: this.body,
                    children: []
                }

                const rdgNode: RdgNode = {
                    type: 'rdg',
                    xmlId: v4(),
                    parent: appNode,
                    children: collatedEvent.children.length === 0 ? [collatedEvent] : [],
                    source: collatedEvent.children.length === 0
                        ? this.sources.map(source => source.id).filter(source => source !== this.sourceOf(affectedNode.xmlId))
                        : Array.from(
                            new Set(
                                collatedEvent.children.map(e => this.sourceOf(e.xmlId) || 'unknown source')
                            )
                        )
                }

                const otherRdgNode: RdgNode = {
                    type: 'rdg',
                    xmlId: v4(),
                    parent: appNode,
                    children: [],
                    source: [this.sourceOf(affectedNode.xmlId) || 'unknown source'],
                    hand: [assumption.hand.id]
                }

                const newCollatedEvent: CollatedEventNode = {
                    type: 'collatedEvent',
                    xmlId: v4(),
                    children: [affectedNode],
                    parent: otherRdgNode
                }

                affectedNode.parent = newCollatedEvent
                otherRdgNode.children.push(newCollatedEvent)
                appNode.children = [rdgNode, otherRdgNode]

                this.body.children.push(appNode)
            }
        }
    }
}
