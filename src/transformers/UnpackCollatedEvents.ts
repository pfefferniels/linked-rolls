import { v4 } from "uuid";
import { CollatedEventNode, FacsNode, filter } from "./Node";
import { Transformer } from "./Transformer";

export class UnpackCollatedEvents extends Transformer<undefined> {
    apply() {
        const nodes = filter(this.body, el => el.type === 'collatedEvent') as CollatedEventNode[]

        for (const collatedEvent of nodes) {
            const index = collatedEvent.parent.children.findIndex(e => e.xmlId === collatedEvent.xmlId)
            if (index === -1) {
                throw new Error(`Parent (${collatedEvent.parent.type}) does not contain child
                    (Total amount of children: ${collatedEvent.parent.children.length})`)
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
                        source: this.sourceOf(event.xmlId) || 'unknown source',
                        url: event.annotates!,
                        parent: event,
                        children: undefined,
                        type: 'facs',
                        xmlId: v4()
                    }
                })

            // deep-cloning rollEvent[0] is very expensive
            // since through its parent node it will copy
            // the whole tree. Therefore deleting parent first.
            const tmp: any = { ...rollEvents[0] }
            delete tmp.parent
            const virtual = structuredClone(tmp)

            virtual.xmlId = collatedEvent.xmlId
            virtual.hasDimension.horizontal.from = from.toFixed(2)
            virtual.hasDimension.horizontal.to = to.toFixed(2)
            virtual.children = allFacs
            delete virtual.annotates
            delete virtual.id

            // replace the current node with the virtual one
            collatedEvent.parent.children.splice(index, 1, virtual)
            virtual.parent = collatedEvent.parent
        }
    }
}
