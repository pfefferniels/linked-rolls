import { v4 } from "uuid";
import { Transformer } from "./Transformer";
import { HandAssignment } from "../types";
import { AppNode, findAncestor, CollatedEventNode, find, RdgNode, AnyRollEventNode, isRollEventNode, filter, wrap } from "./Node";

export class HandAssignmentTransformer extends Transformer<HandAssignment> {
    /**
     * Takes out a roll event of its collated context and 
     * creates a new collated event for it. 
     * @param affectedNode The roll event to extract
     * @returns The newly created collated event.
     * @note The parent of the newly created collated event will
     * have the same parent as the original event, but it will not
     * be appended to its parents' children.
     */
    extractEventFromCollation(affectedNode: AnyRollEventNode): CollatedEventNode | undefined {
        const collatedEvent = affectedNode.parent
        if (collatedEvent.type !== 'collatedEvent') {
            return
        }

        const index = collatedEvent.children.findIndex(e => e.xmlId === affectedNode.xmlId)
        if (index === -1) {
            throw new Error("Event is not a child of its parent")
        }
        collatedEvent.children.splice(index, 1)

        const newCollatedEvent: CollatedEventNode = {
            type: 'collatedEvent',
            xmlId: v4(),
            children: [affectedNode],
            parent: collatedEvent.parent
        }
        affectedNode.parent = newCollatedEvent
        return newCollatedEvent
    }

    sortByExistingReading(events: AnyRollEventNode[]): Map<string | null, AnyRollEventNode[]> {
        const result = new Map<string | null, AnyRollEventNode[]>()

        for (const event of events) {
            const reading = findAncestor(event, 'rdg')
            const key = reading?.xmlId || null
            result.set(key, [...(result.get(key) || []), event])
        }

        return result
    }

    apply(assumption: HandAssignment) {
        if (!assumption.assignedTo.length) {
            console.log('Empty assumption passed to transformer')
            return
        }

        const source = this.sourceOf(assumption.assignedTo[0].id)
        if (!source) {
            console.log('Source of events to which a hand was assigned cannot be determined')
            return
        }

        const byReading = this.sortByExistingReading(
            assumption.assignedTo
                .map(event => find(this.body, event.id))
                .filter(event => event !== undefined && isRollEventNode(event)) as AnyRollEventNode[]
        )

        for (const [readingId, eventsWithHand] of byReading) {
            if (readingId === null) {
                // case 1: the events belong to any reading yet.
                // Take them out of their collated context and 
                // put them in their own <rdg> inside a new <app>
                const app: AppNode = {
                    parent: this.body,
                    children: [],
                    xmlId: v4(),
                    type: 'app'
                }

                const newRdg: RdgNode = {
                    type: 'rdg',
                    hand: [assumption.hand.id],
                    parent: app,
                    xmlId: assumption.id,
                    children: [],
                    source: [source]
                }

                const newCollatedEvents = eventsWithHand
                    .map(e => this.extractEventFromCollation(e))
                    .filter(e => e !== undefined)
                wrap(newCollatedEvents, newRdg)
                wrap([newRdg], app)

                this.body.children.push(app)
                continue
            }

            const rdg = find(this.body, readingId) as RdgNode | undefined
            if (!rdg) continue

            // case 2: the events are grouped already in a reading
            // and all elements in the reading are affected
            // by the hand assignment => simply add a hand to that 
            // reading and we are done
            const existingEvents = filter(rdg, node => isRollEventNode(node))
            const congruent = existingEvents.every(e =>
                eventsWithHand.findIndex(other => other === e) !== -1
            )
            if (congruent) {
                rdg.hand = [assumption.hand.id]
                rdg.xmlId = assumption.id
                console.log('new rdg', rdg)
            }
            else {
                // case 3: already grouped in a reading, but not all
                // elements of that group share the same hand
                // => take "our" events out of their collated context,
                // append another reading to the existing apparatus 
                // with the same source, but with the hand attribute set
                const newRdg: RdgNode = {
                    type: 'rdg',
                    parent: rdg.parent,
                    hand: [assumption.hand.id],
                    children: [],
                    xmlId: assumption.id,
                    source: [source]
                }
                rdg.parent.children.push(newRdg)

                const newCollatedEvents = eventsWithHand
                    .map(e => this.extractEventFromCollation(e))
                    .filter(e => e !== undefined)
                wrap(newCollatedEvents, newRdg)

                // remove all these events from the existing rdg 
                for (const event of eventsWithHand) {
                    const index = rdg.children.indexOf(event)
                    if (index === -1) continue

                    rdg.children.splice(index, 1)
                }
            }
        }
    }
}

