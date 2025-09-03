import { Person } from "./Edition";
import { EditorialAssumption, Motivation } from "./EditorialAssumption";
import { AnySymbol } from "./Symbol";
import { WithId } from "./WithId";

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

export type ActorAssignment = EditorialAssumption<'actorAssignment', Person>

/**
 * Actor should be used to indicate the person who
 * (presumably) carried out the edit. 
 */
export interface Edit extends WithId {
    actor?: ActorAssignment;
    motivation?: Motivation<EditMotivation>;
    insert?: AnySymbol[];
    delete?: string[];
    intentionOf?: AnySymbol[];
}

export const isEdit = (object: any): object is Edit => {
    return 'insert' in object || 'delete' in object;
};

