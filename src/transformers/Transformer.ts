import { v4 } from "uuid";
import { RollCopy } from "../RollCopy";
import { AnyRollEvent, CollatedEvent } from "../types";
import { AnyRollEventNode, AppNode, BodyNode, ChoiceNode, CollatedEventNode, filter, find, findAncestor, isRollEventNode, RdgNode, wrap } from "./Node";

export abstract class Transformer<T> {
    sources: RollCopy[];
    body: BodyNode;

    constructor(sources: RollCopy[], body: BodyNode) {
        this.sources = sources;
        this.body = body;
    }

    abstract apply(obj: T): void;

    rollEventAsNode(event: AnyRollEvent, parent: CollatedEventNode): AnyRollEventNode {
        const result: any = {
            ...event,
            xmlId: event.id,
            parent,
            children: undefined
        }
        delete result.id
        return result
    }

    /**
     * Takes out a roll event of its collated context and 
     * creates a new collated event for it. 
     * @param affectedNode The roll event to extract
     * @returns The newly created collated event.
     * @note The parent of the newly created collated event will
     * have the same parent as the original event, but it will not
     * be appended to its parents' children.
     */
    protected extractEventFromCollation(affectedNode: AnyRollEventNode): CollatedEventNode | undefined {
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

    protected sourceOf(eventId: string) {
        const containingSource = this.sources.find(source => source.hasEventId(eventId))
        if (!containingSource) return
        return containingSource.id
    }

    protected sourcesOf(event_: CollatedEvent | CollatedEvent[] | string[]) {
        const result: Set<string> = new Set()

        if (Array.isArray(event_) && event_.every(e => typeof e === 'string')) {
            for (const id of event_) {
                const sourceLink = this.sourceOf(id)
                if (!sourceLink) continue

                result.add(sourceLink)
            }
            return result
        }

        const events = Array.isArray(event_) ? event_ : [event_]

        for (const event of events) {
            for (const copyEvent of event.wasCollatedFrom) {
                const sourceLink = this.sourceOf(copyEvent.id)
                if (!sourceLink) continue

                result.add(sourceLink)
            }
        }

        return result
    }

    private sortByExistingReading(events: AnyRollEventNode[]): Map<string | null, AnyRollEventNode[]> {
        const result = new Map<string | null, AnyRollEventNode[]>()

        for (const event of events) {
            const reading = findAncestor(event, 'rdg')
            const key = reading?.xmlId || null
            result.set(key, [...(result.get(key) || []), event])
        }

        return result
    }

    protected wrapInRdg = (events: AnyRollEventNode[]): RdgNode[] => {
        const result = []

        const byReading = this.sortByExistingReading(events)

        for (const [readingId, eventsWithHand] of byReading) {
            console.log('delaing with', readingId, eventsWithHand)
            if (readingId === null) {
                // case 1: the events do not belong to any reading yet.
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
                    parent: app,
                    xmlId: v4(),
                    children: [],
                    source: []
                }

                const toBeWrapped = eventsWithHand
                    .map(e => {
                        // typically we are dealing with events wrapped 
                        // inside a collated event. However, we might 
                        // also encounter a conjecture ...
                        const choice = findAncestor(e, 'choice') as ChoiceNode | undefined
                        if (choice) {
                            // in which case we have to take it out of 
                            // its original context (probably <body>) so that
                            // it can be wrapped inside the reading.
                            const index = choice.parent.children.findIndex(otherEvent => otherEvent.xmlId === choice.xmlId)
                            if (index) {
                                choice.parent.children.splice(index, 1)
                            }

                            return choice
                        }

                        return this.extractEventFromCollation(e)
                    })
                    .filter(e => e !== undefined)
                    .filter((e, i, arr) => {
                        return i === arr.indexOf(e)
                    })


                wrap(toBeWrapped, newRdg)
                wrap([newRdg], app)

                this.body.children.push(app)

                result.push(newRdg)
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
                result.push(rdg)
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
                    children: [],
                    xmlId: v4(),
                    source: []
                }
                rdg.parent.children.push(newRdg)
                result.push(newRdg)

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

        return result
    }
}
