import { v4 } from "uuid";
import { CollatedEventNode, FacsNode, filter } from "./Node";
import { Transformer } from "./Transformer";

export class UnpackCollatedEvents extends Transformer<undefined> {
    apply() {
        const nodes = filter(this.body, el => el.type === 'collatedEvent') as CollatedEventNode[]

        for (const collatedEvent of nodes) {
            const index = collatedEvent.parent.children.findIndex(e => e.xmlId === collatedEvent.xmlId)
            if (index === -1) {
                throw new Error("Parent does not contain child")
            }

            const rollEvents = collatedEvent.children
            if (rollEvents.length === 0) {
                // Just remove this event from its parent 
                collatedEvent.parent.children.splice(index, 1)
                continue
            }
        
            const from = rollEvents.reduce((acc, curr) => acc + curr.hasDimension.horizontal.from, 0) / rollEvents.length
            const to = rollEvents.reduce((acc, curr) => acc + curr.hasDimension.horizontal.to!, 0) / rollEvents.length
        
            const allFacs: FacsNode[] = rollEvents
                .filter(event => event.annotates !== undefined)
                .map(event => {
                return {
                    source: this.sourceOf(event.id) || 'unknown source',
                    url: event.annotates!,
                    parent: event,
                    children: undefined,
                    type: 'facs',
                    xmlId: v4()
                }
            })
        
            const virtual = structuredClone(rollEvents[0])
            virtual.xmlId = collatedEvent.xmlId
            virtual.hasDimension.horizontal.from = from
            virtual.hasDimension.horizontal.to = to
            virtual.children = allFacs
            delete virtual.annotates

            // replace the current node with the virtual one
            collatedEvent.parent.children.splice(index, 1, virtual)
            virtual.parent = collatedEvent.parent
        }
    }
}
