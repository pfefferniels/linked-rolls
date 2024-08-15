import { RollCopy } from "../RollCopy";
import { Assumption, CollatedEvent } from "../types";
import { BodyNode } from "./Node";

export abstract class Transformer<T> {
    sources: RollCopy[];
    body: BodyNode;
    assumptions: Assumption[];

    constructor(sources: RollCopy[], body: BodyNode, assumptions: Assumption[]) {
        this.sources = sources;
        this.body = body;
        this.assumptions = assumptions;
    }

    abstract apply(obj: T): void;

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

}
