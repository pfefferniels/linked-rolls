import { Assumption } from "./Assumption.js";
import { AnySymbol } from "./Symbol.js";
import { WithId } from "../shared/utils.js";

/**
 * The types of editorial change an edit may state.
 * @category Vocabulary
 */
export const editTypes = [
    'additional-accent',
    'add-redundancy',
    'remove-redundancy',
    /**
     * Carries the text into another reproducing system's coding: a
     * latched pair of one system giving way to the other's held command,
     * a command the other system cannot read struck, or one of its own
     * put in where the first had no word for it.
     */
    'recoding',
    'shift',
    'correct-error',
    'shorten',
    'prolong',
] as const;

/**
 * The type of editorial change applied to a symbol or set of symbols.
 * Classifies the nature of the edit, e.g. whether it corrects an error,
 * adds an accent, shifts a note, or shortens/prolongs a perforation.
 * @category Format types
 */
export type EditType = typeof editTypes[number];

/**
 * A set of edits transforms a version of a roll into another version.
 * Edits insert or delete symbols, or both (= replace).
 * Edits may be motivated by a given set of reasons, e.g.
 * to add an additional accent or to correct an error.
 * If an edit is the interpretation of a metamark,
 * such as a pencil mark, this should be made explicit
 * using a meaning comprehension on the `@annotation` field.
 * An edit states no date. That it ended no later than the act that
 * made a feature carrying a symbol it inserts, a reasoner derives with
 * the axioms of reo.ttl; which of those dates bounds it closest is for
 * a query to pick.
 * @see reo:Edit
 * @category Format types
 */
export interface Edit extends WithId, Assumption {
    type: 'edit';
    /**
     * The type of editorial change (e.g. 'correct-error', 'additional-accent').
     * @see crm:P2 has type
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
     * @see reo:added
     */
    insert?: AnySymbol[];
    /**
     * References (by `@id`) to the symbols to be deleted by this edit.
     * @see reo:removed
     */
    delete?: string[];
}

/**
 * Whether the object is an edit.
 * @category Lookups
 */
export const isEdit = (object: any): object is Edit => {
    return 'type' in object && object.type === 'edit';
};
