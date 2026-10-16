import { Assumption } from "./Assumption.js";
import { AnySymbol } from "./Symbol.js";
import { WithId, WithNote, WithType } from "../shared/utils.js";

/**
 * A reason for a musical change, in the editor's words. The edition
 * states its motivations once (`Edition.motivations`), and an edit of
 * any version names the one it was made for. Speculating about why a
 * change was made is kept to musical changes: a technical change needs
 * no motivation, and a repair or a safeguard names one the vocabulary
 * publishes (`correctedError`, `safeguard`).
 * @see crm:E33 Linguistic Object
 * @category Format types
 */
export type Motivation = WithType<'motivation'> & WithId & WithNote

/**
 * The motivation of a musical change whose reason is not given yet. A
 * program gives it to a change whose shape a musical decision makes,
 * such as an added accent or a perforation put elsewhere, under the
 * rule that later versions are the more refined; the editor puts a
 * reason of their own in its place.
 * @category Versions and stemma
 */
export const musicalChange = 'https://w3id.org/reo/type/motivation/musical'

/**
 * The motivation of a repair: the edit puts right what the version it
 * derives from got wrong, a perforation put in the wrong place, struck
 * or left out. Whether a change corrects an error is not read off its
 * shape, and so it is the editor's to say.
 * @category Versions and stemma
 */
export const correctedError = 'https://w3id.org/reo/type/motivation/corrected-error'

/**
 * The motivation of a safeguard: a command the text makes no use of,
 * added on purpose so that the instrument is left as it should be, as
 * a soft pedal released once more after the last note is. It is a
 * technical change, and the one that has to be said, since an added
 * redundancy is otherwise not expected of a later version.
 * @category Versions and stemma
 */
export const safeguard = 'https://w3id.org/reo/type/motivation/safeguard'

/**
 * The kinds of change an edit can be: one that changes the
 * performance, one that changes only how it is carried, and one that
 * puts back what the version derived from got wrong.
 * @category Vocabulary
 */
export const changeKinds = ['musical', 'technical', 'repair'] as const;

/**
 * The kind of change an edit is (`kindOfChange`).
 * @category Format types
 */
export type ChangeKind = typeof changeKinds[number];

/**
 * What kind of change the edit is, as its motivation says. One without
 * a motivation is technical: a redundancy cleaned up, or a command
 * recoded for another system, which the procedure of the version's
 * creation explains. A safeguard is technical too, a corrected error a
 * repair, and every other motivation, the generic `musicalChange`
 * among them, makes it musical.
 *
 * The edits of a version that derives from none state its text rather
 * than a change, and are of no kind.
 * @category Versions and stemma
 */
export const kindOfChange = (edit: Readonly<Pick<Edit, 'motivation'>>): ChangeKind =>
    edit.motivation === undefined || edit.motivation === safeguard
        ? 'technical'
        : edit.motivation === correctedError ? 'repair' : 'musical'

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
 * The motivation a program gives a change of this shape. It gives none
 * where the shape shows a technical change, a recoding or a redundancy
 * removed, and none where it shows one it cannot explain, a redundancy
 * added, which the editor states as a safeguard where it is one. Every
 * other change of a later version is taken for a refinement, and so
 * for a musical change whose reason is not given yet (`musicalChange`).
 * @category Versions and stemma
 */
export const motivationProposedFor = (shape: EditShape | undefined): string | undefined =>
    shape === 'recoding' || shape === 'remove-redundancy' || shape === 'add-redundancy'
        ? undefined
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
     * or a motivation the vocabulary publishes, by IRI. A technical
     * change states none.
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
