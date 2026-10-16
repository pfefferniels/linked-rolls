import { Assumption } from "./Assumption.js";
import { AnySymbol } from "./Symbol.js";
import { WithId, WithNote, WithType } from "../shared/utils.js";

/**
 * A reason for a musical change, in the editor's words. The edition
 * states its motivations once (`Edition.motivations`), and an edit of
 * any version names the one it was made for. Every change of a version
 * that derives from another states a motivation: a program states
 * whether it is musical or technical (`musicalChange`,
 * `technicalChange`), and the editor puts a reason of their own in
 * place of a musical one. Speculating about why a change was made is
 * kept to the musical changes.
 * @see crm:E33 Linguistic Object
 * @category Format types
 */
export type Motivation = WithType<'motivation'> & WithId & WithNote

/**
 * The motivation of a musical change whose reason is not given yet: a
 * change of the performance, such as an added accent or a perforation
 * put elsewhere. A program states it for a change whose shape a musical
 * decision makes, under the rule that later versions are the more
 * refined; the editor puts a reason of their own in its place.
 * @category Versions and stemma
 */
export const musicalChange = 'https://w3id.org/reo/type/motivation/musical'

/**
 * The motivation of a technical change: one that changes only how the
 * performance is carried, a redundancy cleaned up or added, or a
 * command recoded for another reproducing system. A program states it
 * for a change of such a shape, and the procedure of the version's
 * creation explains it, so that no reason of its own is given.
 * @category Versions and stemma
 */
export const technicalChange = 'https://w3id.org/reo/type/motivation/technical'

/**
 * The kinds of change an edit can be: one that changes the
 * performance, and one that changes only how it is carried.
 * @category Vocabulary
 */
export const changeKinds = ['musical', 'technical'] as const;

/**
 * The kind of change an edit is (`kindOfChange`).
 * @category Format types
 */
export type ChangeKind = typeof changeKinds[number];

/**
 * What kind of change the edit is, as its motivation says: technical
 * if it is `technicalChange`, musical if it is `musicalChange` or a
 * reason of the editor's.
 *
 * An edit without a motivation is of no kind: the edits of a version
 * that derives from none state its text rather than a change.
 * @category Versions and stemma
 */
export const kindOfChange = (edit: Readonly<Pick<Edit, 'motivation'>>): ChangeKind | undefined =>
    edit.motivation === undefined
        ? undefined
        : edit.motivation === technicalChange ? 'technical' : 'musical'

/**
 * The shapes a change can take, read off what it inserts and deletes
 * and the systems of the two versions (`shapeOf`, `proposeEdits`). A
 * shape is not stated: it is what a program reads to propose a
 * motivation, and what a view can call a change.
 * @category Vocabulary
 */
export const editShapes = [
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
    'shorten',
    'prolong',
] as const;

/**
 * The shape of a change (`editShapes`).
 * @category Format types
 */
export type EditShape = typeof editShapes[number];

/**
 * The motivation a program states for a change of this shape. A
 * recoding and a redundancy removed or added are technical changes
 * (`technicalChange`). Every other change of a later version is taken
 * for a refinement, and so for a musical change whose reason is not
 * given yet (`musicalChange`).
 * @category Versions and stemma
 */
export const motivationProposedFor = (shape: EditShape | undefined): string =>
    shape === 'recoding' || shape === 'remove-redundancy' || shape === 'add-redundancy'
        ? technicalChange
        : musicalChange

/**
 * A set of edits transforms a version of a roll into another version.
 * Edits insert or delete symbols, or both (= replace).
 * What kind of change an edit is follows from its motivation
 * (`kindOfChange`).
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
     * Why the edit was made: one of the edition's motivations, by id,
     * or one the vocabulary publishes, by IRI (`musicalChange`,
     * `technicalChange`). An edit of a version that derives from none
     * states none.
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
