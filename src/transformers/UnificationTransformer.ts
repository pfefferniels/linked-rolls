import { AnyRollEvent, CollatedEvent, Relation, Unification } from "../types";
import { Transformer } from "./Transformer";
import { AnyRollEventNode, ChoiceNode, CollatedEventNode, CorrNode, find, SicNode, wrap } from "./Node";
import { RelationTransformer } from "./RelationTransformer";
import { v4 } from "uuid";

export class UnificationTransformer extends Transformer<Unification> {
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

    apply(assumption: Unification) {
        if (!assumption.unified.length) {
            console.log('No events to apply the unification assumption on')
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

        const unifiedNodes: CollatedEventNode[] = assumption.unified.map(event => {
            const result: CollatedEventNode = {
                children: [],
                parent: sic,
                xmlId: v4(),
                type: 'collatedEvent'
            }
            result.children = [this.rollEventAsNode(event, result)]
            return result
        })
        wrap(unifiedNodes, sic)

        const correctedNode = find(this.body, assumption.unified[0].id) as AnyRollEventNode | undefined
        if (!correctedNode) {
            console.log('Corrected node not found in tree')
            return
        }

        const collatedEvent = correctedNode.parent as CollatedEventNode

        const index = collatedEvent.parent.children.findIndex(e => e.xmlId === collatedEvent.xmlId)
        if (index === -1) {
            throw new Error('Node not a child of its parent')
        }
        console.log(index, 'index', collatedEvent.parent)
        collatedEvent.parent.children.splice(index, 1, choice)

        const corr: CorrNode = {
            type: 'corr',
            parent: choice,
            children: [],
            xmlId: v4(),
        }

        const extractedEvent = this.extractEventFromCollation(correctedNode)
        if (!extractedEvent) {
            console.log('Event extraction failed')
            return
        }
        extractedEvent.parent = corr
        corr.children = [extractedEvent]

        choice.children = [sic, corr]
        sic.parent = choice
        corr.parent = choice

        // the collated event wrapped more than one roll event?
        // In that case we have to wrap it in a reading
        if (collatedEvent.children.length > 0) {
            collatedEvent.parent = this.body
            this.body.children.push(collatedEvent)

            // wrap choice into one rdg and all the other 
            // events into another one

            const relation: Relation = {
                type: 'relation',
                carriedOutBy: '#transformation-tool',
                id: v4(),
                relates: [
                    {
                        contains: [this.nodeAsCollatedEvent(collatedEvent)],
                        id: v4()
                    },
                    {
                        contains: [this.nodeAsCollatedEvent(extractedEvent)],
                        id: v4()
                    }
                ]
            }

            const insertRelation = new RelationTransformer(this.sources, this.body, this.assumptions)
            insertRelation.apply(relation)
        }
    }
}
