import { v4 } from "uuid";
import { Separation } from "../types";
import { Transformer } from "./Transformer";
import { AnyRollEventNode, BodyNode, ChoiceNode, CollatedEventNode, CorrNode, find, RdgNode, SicNode } from "./Node";
import { rollEventAsNode } from "./InsertCollatedEvent";

export class SeparationTransformer extends Transformer<Separation> {
    apply(assumption: Separation) {
        const collatedEvents: CollatedEventNode[] = []
        for (const part of assumption.into) {
            const node = find(this.body, part.id) as AnyRollEventNode | undefined
            if (!node) {
                console.log('A part of the splitted event could not be found', part)
                continue
            }

            if (node.parent.type !== 'collatedEvent') {
                console.log('This transformer should not be applied after collated events are dissolved')
                continue
            }
            collatedEvents.push(node.parent)
        }

        if (collatedEvents.length === 0) {
            console.log('Events for', assumption, 'were not found.')
        }

        if (collatedEvents.some(e => e.parent.type === 'sic' || e.parent.type === 'corr')) {
            console.log('Aborting. At least on of', collatedEvents, 'is already packed inside sic or corr')
            return
        }

        // wrap collated events in choice
        const parentNode = collatedEvents[0].parent as RdgNode | BodyNode

        const choice: ChoiceNode = {
            type: 'choice',
            parent: parentNode,
            children: [],
            xmlId: assumption.id
        }

        const corr: CorrNode = {
            type: 'corr',
            xmlId: v4(),
            parent: choice,
            children: collatedEvents
        }

        collatedEvents.forEach((collatedEvent, i) => {
            // replace the original parent with the corr node
            collatedEvent.parent = corr

            const index = parentNode.children.findIndex(e => e.xmlId === collatedEvent.xmlId)
            if (index === -1) return

            if (i === 0) {
                // replace the actual collated event with the choice
                // in which it is wrapped now (only once)
                parentNode.children.splice(index, 1, choice)
            }
            else {
                // remove the collated event from its parent, since 
                // it now lives within corr
                parentNode.children.splice(index, 1)
            }
        })

        const sic: SicNode = {
            type: 'sic',
            xmlId: v4(),
            parent: choice,
            children: []
        }

        const newCollatedEvent: CollatedEventNode = {
            type: 'collatedEvent',
            xmlId: v4(),
            parent: sic,
            children: []
        }

        newCollatedEvent.children.push(rollEventAsNode(assumption.separated, newCollatedEvent))
        sic.children.push(newCollatedEvent)

        choice.children = [sic, corr]
    }
}
