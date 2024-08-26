import { Relation } from "../EditorialActions";
import { AppNode, ChoiceNode, CollatedEventNode, find, findAncestor, RdgNode } from "./Node";
import { Transformer } from "./Transformer";
import { determineSources } from "../asXML";
import { v4 } from "uuid";

export class RelationTransformer extends Transformer<Relation> {
    apply(relation: Relation) {
        console.log('delaing with relation', relation)
        const readings = relation.relates

        const app: AppNode = {
            parent: this.body,
            children: [],
            xmlId: relation.id,
            type: 'app',
            resp: [relation.carriedOutBy]
        }

        const allSources = this.sources.map(s => s.id).sort()
        const eventSources =
            readings
                .map(r => Array.from(determineSources(this.sources, r.contains)))
                .flat()
        const missing = allSources.filter(source => eventSources.indexOf(source) === -1);

        const finishedSources: string[] = []
        let anchored = false
        readings.forEach((reading) => {
            const events =
                reading.contains
                    .map(e => find(this.body, e.id))
                    .filter(e => e !== undefined)
                    .map(e => {
                        const choice = findAncestor(e, 'choice')
                        if (choice) return choice
                        return e
                    }) as (ChoiceNode | CollatedEventNode)[]

                    console.log('events=', events)

            if (events.length === 0) {
                return
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

            events.forEach((event) => {
                const parent = event.parent
                const index = parent.children.findIndex(e => e.xmlId === event.xmlId)

                // replace first event node with app node and
                // remove all remaining events
                if (!anchored) {
                    parent.children.splice(index, 1, app)
                    anchored = true
                }
                else {
                    parent.children.splice(index, 1)
                }

                event.parent = rdg
            })

            finishedSources.push(...source)
            app.children.push(rdg)
        })

        // empty reading for the missing sources
        if (missing.length > 0) {
            const emptyRdg: RdgNode = {
                parent: app,
                children: [],
                xmlId: v4(),
                type: 'rdg',
                source: missing
            }
            app.children.push(emptyRdg)
        }

        console.log('inserted', app)
    }
}
