import { RollCopy } from "../RollCopy";
import { BodyNode } from "./Node";

export abstract class Transformer<T> {
    sources: RollCopy[];
    body: BodyNode;

    constructor(sources: RollCopy[], body: BodyNode) {
        this.sources = sources;
        this.body = body;
    }

    abstract apply(obj: T): void;

    protected sourceOf(eventId: string) {
        const containingSource = this.sources.find(source => source.hasEventId(eventId))
        if (!containingSource) return
        return containingSource.id
    }
}
