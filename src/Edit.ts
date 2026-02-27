import { Assumption, ObjectAssumption } from "./Assumption";
import { Person } from "./Edition";
import { AnySymbol } from "./Symbol";
import { WithId } from "./utils";

export const editTypes = [
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

/**
 * The type of editorial change applied to a symbol or set of symbols.
 * Classifies the nature of the edit, e.g. whether it corrects an error,
 * adds an accent, shifts a note, or shortens/prolongs a perforation.
 */
export type EditType = typeof editTypes[number];

/**
 * An actor assignment associates a person with an action.
 * It is an object assumption so that the attribution can be
 * annotated with a belief about its certainty.
 */
export type ActorAssignment = ObjectAssumption<Person>

/**
 * A set of edits transforms a version of a roll into another version.
 * Edits insert or delete symbols, or both (= replace).
 * Edits may be motivated by a given set of reasons, e.g.
 * to add an additional accent or to correct an error.
 * If an edit is the interpretation of a metamark,
 * such as a pencil mark, this should be made explicit
 * using a meaning comprehension on the `@annotation` field.
 * @see reo:C8 Edit
 */
export interface Edit extends WithId, Assumption {
    type: 'edit';
    /**
     * The type of editorial change (e.g. 'correct-error', 'additional-accent').
     */
    editType?: EditType;
    /**
     * A textual description of the motivation for this edit,
     * referencing a motivation defined in the version's motivations list.
     * @see crm:P17 was motivated by
     */
    motivation?: string;
    /**
     * The symbols to be inserted by this edit.
     * @see reo:P7 added
     */
    insert?: AnySymbol[];
    /**
     * References (by `@id`) to the symbols to be deleted by this edit.
     * @see reo:P8 removed
     */
    delete?: string[];
}

export const isEdit = (object: any): object is Edit => {
    return 'type' in object && object.type === 'edit';
};
