import { RollCopy } from "./RollCopy";
import { CollatedEvent, Assumption } from "./types";

export const asTurtle = (
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    editorialAssumptions: Assumption[]) => {
    // TODO: implement with rdflib.js
    console.log(sources, collatedEvents, editorialAssumptions)
}
