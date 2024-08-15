import { v4 } from "uuid";
import { Relation } from "../types";
import { AppNode, ChoiceNode, CollatedEventNode, find, findAncestor, RdgNode } from "./Node";
import { Transformer } from "./Transformer";
import { determineSources } from "../asXML";

export class RelationTransformer extends Transformer<Relation> {
    apply(relation: Relation) {
        console.log('dealing with relation', relation)
        const readings = relation.relates

        const app: AppNode = {
            parent: this.body,
            children: [],
            xmlId: relation.id,
            type: 'app'
        }

        const allSources = this.sources.map(s => s.id).sort()
        const eventSources =
            readings
                .map(r => Array.from(determineSources(this.sources, r.contains)))
                .flat()
        const missing = allSources.filter(source => eventSources.indexOf(source) === -1);

        const finishedSources: string[] = []
        for (const reading of readings) {
            const events =
                reading.contains
                    .map(e => find(this.body, e.id))
                    .filter(e => e !== undefined)
                    .map(e => {
                        const choice = findAncestor(e, 'choice')
                        if (choice) return choice
                        return e
                    }) as (ChoiceNode | CollatedEventNode)[]

            if (events.length === 0) {
                // => they get an empty reading 
                const emptyRdg: RdgNode = {
                    parent: app,
                    children: [],
                    xmlId: v4(),
                    type: 'rdg',
                    source: missing
                }
                app.children.push(emptyRdg)
                continue
            }

            // wrap events in a rdg
            const source = Array.from(determineSources(this.sources, reading.contains))
            const rdg: RdgNode = {
                parent: app,
                children: events,
                xmlId: v4(),
                type: 'rdg',
                source
            }

            events.forEach((event, i) => {
                event.parent = rdg
                const index = this.body.children.findIndex(e => e.xmlId === event.xmlId)

                // replace first event node with app node and
                // remove all remaining events
                if (i === 0) {
                    this.body.children.splice(index, 1, app)
                }
                else {
                    this.body.children.splice(index, 1)
                }
            })

            finishedSources.push(...source)
            app.children.push(rdg)
        }
    }
}
