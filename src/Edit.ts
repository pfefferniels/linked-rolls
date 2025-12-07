import { ObjectAssumption } from "./Assumption";
import { Person } from "./Edition";
import { AnySymbol } from "./Symbol";
import { WithId } from "./utils";

export const editMotivations = [
    /**
     * An additional accent that can only be encoded with 
     * sforzando on/off due to the short space left between
     * the notes to be differentiated.
     */
    'short-dynamic-differentation',
    'additional-accent',
    'add-redundancy',
    'remove-redundancy',
    'replace-with-equivalent',
    'shift',
    'correct-error',
    'shorten',
    'prolong',
] as const;

export type EditMotivation = typeof editMotivations[number];

export type ActorAssignment = ObjectAssumption<Person>

/**
 * A set of edits transforms a version of a roll into another version.
 * Edits insert or delete symbols, or both (= replace).
 * Edits may be motivated by a given set of reasons, e.g.
 * to add an additional accent or to correct an error.
 */
export interface Edit extends WithId {
    type: 'edit';
    motivation?: EditMotivation;
    actor?: ActorAssignment;
    insert?: AnySymbol[];
    delete?: string[];
    intentionOf?: AnySymbol[];
}

export const isEdit = (object: any): object is Edit => {
    return 'type' in object && object.type === 'edit';
};
