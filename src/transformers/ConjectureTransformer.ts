import { AnyRollEvent, CollatedEvent } from "../types";
import { Relation, Conjecture } from "../EditorialActions";
import { Transformer } from "./Transformer";
import { AnyRollEventNode, ChoiceNode, CollatedEventNode, CorrNode, find, SicNode, wrap } from "./Node";
import { RelationTransformer } from "./RelationTransformer";
import { v4 } from "uuid";

export class ConjectureTransformer extends Transformer<Conjecture> {
    private nodeAsRollEvent(node: AnyRollEventNode): AnyRollEvent {
        return {
            ...node,
            id: node.xmlId
        }
    }

    private nodeAsCollatedEvent(node: CollatedEventNode): CollatedEvent {
        return {
            wasCollatedFrom: node.children.map(n => this.nodeAsRollEvent(n)),
            id: node.xmlId
        }
    }

    apply(assumption: Conjecture) {
        if (!assumption.replaced.length) {
            console.log('No events to apply the conjecture assumption on')
            return
        }

        if (!assumption.with.length) {
            console.log(`Nothing to replace the original event with. Note that if
                there has been a scanning error and you want to remove an event, 
                use a new measurement rather than inserting an editorial action.`)
            return
        }

        const choice: ChoiceNode = {
            type: 'choice',
            parent: this.body,
            xmlId: assumption.id,
            children: []
        }

        const sic: SicNode = {
            type: 'sic',
            parent: choice,
            xmlId: v4(),
            children: []
        }

        const replacedNodes: CollatedEventNode[] = assumption.replaced.map(event => {
            const result: CollatedEventNode = {
                children: [],
                parent: sic,
                xmlId: v4(),
                type: 'collatedEvent'
            }
            result.children = [this.rollEventAsNode(event, result)]
            return result
        })
        wrap(replacedNodes, sic)

        const correctedNodes = assumption.with
            .map(event => find(this.body, event.id))
            .filter(node => node !== undefined) as AnyRollEventNode[]

        const collatedEvents = correctedNodes.map(node => node.parent as CollatedEventNode)
        if (!collatedEvents.length) {
            console.log(`The assumption does not point to roll event nodes`)
        }

        // take the first collated event and replace it with choice
        collatedEvents.forEach((collatedEvent, i) => {
            const index = collatedEvent.parent.children.findIndex(e => e.xmlId === collatedEvent.xmlId)
            if (index === -1) {
                throw new Error('Node not a child of its parent')
            }

            if (i === 0) {
                collatedEvent.parent.children.splice(index, 1, choice)
            }
            else {
                collatedEvent.parent.children.splice(index, 1)
            }
        })

        const corr: CorrNode = {
            type: 'corr',
            parent: choice,
            children: [],
            xmlId: v4(),
        }

        choice.children = [sic, corr]
        sic.parent = choice
        corr.parent = choice

        const leftOver = []
        const alternative = []

        for (const correctedNode of correctedNodes) {
            const collatedEvent = correctedNode.parent
            if (collatedEvent.type !== 'collatedEvent') {
                throw new Error('Something went wrong')
            }

            const extractedEvent = this.extractEventFromCollation(correctedNode)
            if (!extractedEvent) {
                console.log('Event extraction failed')
                return
            }
            extractedEvent.parent = corr
            corr.children.push(extractedEvent)

            // After extracting "our" event, the collated event
            // still wraps more than zero roll events?
            // In that case we have to wrap it in a reading
            if (collatedEvent.children.length > 0) {
                collatedEvent.parent = this.body
                this.body.children.push(collatedEvent)

                leftOver.push(collatedEvent)
                alternative.push(extractedEvent)
            }
        }

        // wrap choice into one rdg and all the other 
        // events into another one
        const relation: Relation = {
            type: 'relation',
            carriedOutBy: '#conjecture-transformation',
            id: v4(),
            relates: [
                {
                    contains: leftOver.map(event => this.nodeAsCollatedEvent(event)),
                    id: v4()
                },
                {
                    contains: alternative.map(event => this.nodeAsCollatedEvent(event)),
                    id: v4()
                }
            ]
        }

        const insertRelation = new RelationTransformer(this.sources, this.body)
        insertRelation.apply(relation)
    }
}
