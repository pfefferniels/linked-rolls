import { WithNote, WithId } from "../shared/utils.js"
import { Concept, Person, Software, WithActor } from "./Agent.js"

/**
 * The certainties a belief may be held with, from the most certain to
 * the least.
 * @category Vocabulary
 */
export const certainties = [
    'true',
    'likely',
    'possible',
    'unlikely',
    'false'
] as const;

/**
 * Certainty levels for beliefs, ranging from 'true' to 'false'
 * and some values in between.
 * @category Format types
 */
export type Certainty = typeof certainties[number];

/**
 * Whether a statement held with this certainty is stated as a fact when
 * the edition is read as RDF. One held possible, unlikely or false is
 * only quoted, so that a reader who leaves the beliefs aside does not
 * take a doubted statement for the edition's own.
 * @category Assumptions and beliefs
 */
export const isAsserted = (certainty: Certainty): boolean =>
    certainty === 'true' || certainty === 'likely'

/**
 * The certainty a statement is held with for itself. One that carries
 * no belief is stated plainly, and so held true; one that belongs to a
 * proposition set is held with the set's belief, which `certaintyIn`
 * reads.
 * @category Assumptions and beliefs
 */
export const certaintyOf = (assumption: Readonly<Assumption>): Certainty =>
    assumption['@annotation']?.belief?.certainty ?? 'true'

/**
 * An argumentation provides reasons for a belief and
 * may be associated with a person carrying out that argumentation.
 * @see crminf:I1 Argumentation
 * @category Format types
 */
export interface Argumentation<T extends string = 'simpleArgumentation'> extends WithActor, WithNote {
    type: T
}

/**
 * A meaning comprehension interprets or disambiguates the meaning of
 * symbols or features. For example, interpreting a pencil mark
 * as an instruction to add or remove a perforation or as the dating
 * of the roll.
 * @see crminf:I16 Meaning Comprehension
 * @category Format types
 */
export interface MeaningComprehension extends Argumentation<'meaningComprehension'> {
    /**
     * References (by `@id`) to the symbols or features
     * whose meaning is being interpreted.
     * @see crminf:J22 interpreted meaning of
     */
    comprehends: string[]
}

/**
 * An inference draws a conclusion from given premises.
 * @see crminf:I5 Inference Making
 * @category Format types
 */
export interface Inference extends Argumentation<'inference'> {
    /**
     * References (by `@id`) to the beliefs
     * from which the conclusion is drawn.
     *
     * A belief the editor holds and publishes elsewhere under an IRI of
     * its own, such as a bound from a catalogue of premises the editor
     * keeps, is named by that IRI. Someone else's belief is not: it is
     * adopted first, and the belief of the edition's own that the
     * adoption concludes is named instead.
     * @see crminf:J1 used as premise
     */
    premises: string[]

    /**
     * References (by `@id`) to what the inference worked on besides
     * beliefs, such as the versions it compared, the analysis output it
     * cites, or the document holding a premise named by IRI, in the
     * state it was read in, since a belief published elsewhere may move
     * after the edition has used it.
     * @see crm:P16 used specific object
     */
    used?: string[]

    /**
     * The rules the inference draws its conclusion by, by IRI: a
     * regularity of how the rolls were edited, such as that the same
     * addition at the same place is not made twice independently, a
     * default, such as that copies were not made from two exemplars, or
     * a method, such as how the tolerance of a collation is found. The
     * rules are stated once where they are published, and each
     * inference names those it follows, so that a reader can see what
     * a conclusion rests on besides its premises, and which conclusions
     * rest on a rule.
     * @see crminf:J3 applied
     */
    applies?: string[]

    /**
     * The programs that drew the conclusion, each with its version,
     * where a program drew it: a stemma `proposeStemma` found, which the
     * editor ran and holds. The actor is the one who ran it, since a
     * program holds no belief. Naming software makes the inference a
     * digital machine event in the sense of CRMdig, which can be run
     * again on what it used, and the note states what it was run with.
     * @see crmdig:L23 used software or firmware
     */
    software?: Software[]

    /**
     * When the conclusion was drawn. It is part of the reason and
     * carries no belief of its own, and it tells a run of a program
     * from the next, since a program may conclude otherwise once it, or
     * what it used, has changed.
     * @see crm:P4 has time-span
     */
    date?: TimeSpan
}

/**
 * A belief adoption takes over someone else's belief without checking it:
 * knowledge through private communication, from the secondary
 * literature, or from another edition. Like every reason, it concludes
 * the belief it is a reason of, which is the edition's own and holds of
 * the edition's statement what the adopted belief held. An inference that
 * relies on it names that belief among its premises.
 *
 * The editor's own beliefs need no adoption, wherever they are
 * published: an inference names them directly (see `Inference`).
 * @see crminf:I7 Belief Adoption
 * @category Format types
 */
export interface BeliefAdoption extends Argumentation<'beliefAdoption'> {
    /**
     * A note describing the source of the adopted belief,
     * e.g. a bibliographic reference or personal communication.
     * Where the belief is adopted by its IRI, the note says in which
     * state it was taken over, since a belief published elsewhere may
     * move after the edition has taken it.
     * @see crm:P3 has note
     */
    note: string;

    /**
     * The beliefs this adoption takes over, by IRI, where they are
     * published with one. They are someone else's, and stay theirs: what
     * the edition holds is the belief the adoption concludes.
     * @see crminf:J6 adopted
     */
    adopted?: string[]
}

/**
 * A measurement takes a value off an object by a stated procedure: the
 * period the slot lengths of a copy keep, the median pitch of its held
 * notes. It concludes the belief in that value by itself, with no
 * premises. CRMinf counts observations, and a measurement is one, among
 * the ways a belief comes about, so the value does not have to be
 * passed off as an inference.
 *
 * A measurement a program took names the program and its version, so
 * that the value can be taken again and a value taken by a program
 * later found wanting can be told from the rest. Naming software makes
 * it a digital measurement event in the sense of CRMdig.
 * @see crmsci:S21 Measurement
 * @category Format types
 */
export interface Measurement extends Argumentation<'measurement'> {
    /**
     * References (by `@id` or URL) to what the measurement was taken on
     * or with, such as the scan, the analysis output or the script.
     * @see crm:P16 used specific object
     */
    used?: string[]

    /**
     * The method followed, where it has a name apart from the program
     * that carries it out, such as a line of Theil and Sen through the
     * matched notes of two copies.
     * @see crm:P33 used specific technique
     */
    procedure?: Concept

    /**
     * The programs that took the measurement, each with its version.
     * @see crmdig:L23 used software or firmware
     */
    software?: Software[]

    /**
     * When the measurement was taken. It is part of the reason and
     * carries no belief of its own.
     * @see crm:P4 has time-span
     */
    date?: TimeSpan
}

/**
 * An argumentation can be either a plain argumentation, a
 * meaning comprehension, an inference, a belief adoption or a
 * measurement.
 * @category Format types
 */
export type AnyArgumentation = MeaningComprehension | Inference | BeliefAdoption | Measurement | Argumentation

/**
 * A belief is a temporal object and associates a proposition (i.e.
 * a statement) with a certainty. It comes into existence through
 * argumentations (reasons).
 * @see crminf:I2 Belief
 * @category Format types
 */
export interface Belief extends WithId {
    type: 'belief';
    /**
     * The level of certainty associated with this belief.
     * @see crminf:J5 holds to be
     */
    certainty: Certainty;
    /**
     * The argumentations providing reasons for this belief.
     * @see crminf:J2i was concluded by
     */
    reasons: AnyArgumentation[]
}

/**
 * An assumption is the reification of a triple. This leverages the
 * `@annotation` element from JSON-LD-star. Any property in the edition
 * can be annotated with a belief to express uncertainty or provide
 * justification for the stated value.
 * @category Format types
 */
export interface Assumption {
    /**
     * An optional annotation expressing a belief about this assumption.
     * Uses the JSON-LD-star `@annotation` mechanism to attach
     * epistemic metadata (certainty and reasons) to any triple.
     *
     * An annotation that carries no belief names, by its `id`, the
     * proposition set the statement belongs to (`PropositionSet`): the
     * statement is held with the belief the set states, together with
     * the other statements that name it.
     */
    '@annotation'?: WithId & {
        /**
         * The belief held about the annotated statement, where it is
         * held for itself rather than as one of a proposition set.
         * @see crminf:J4i is subject of
         */
        belief?: Belief;
    }
}

/**
 * Statements held together under one belief, because one reasoning
 * concluded them together: the derivations and edits of a stemma, which
 * a search such as `proposeStemma` scores as a whole rather than one
 * derivation at a time, or the edits a proposal grouped the changes of
 * versions into. Each statement belongs to the set by naming it in its
 * annotation, which carries the set's id and no belief of its own, and
 * the belief is stated here, once, with the reasoning that concluded
 * it. Read as RDF, the set is the reifier of each statement that names
 * it, which RDF 1.2 lets reify several.
 *
 * A statement the editor takes out of the set by giving it a belief of
 * its own is the editor's, and its reasons can name the set's belief as
 * a premise, so that what the editor decided apart from the program
 * stays apart from it.
 * @see crminf:I4 Proposition Set
 * @category Format types
 */
export interface PropositionSet extends WithId {
    type: 'propositionSet'

    /**
     * The belief the statements of the set are held with, and the
     * reasons for it.
     * @see crminf:J4i is subject of
     */
    belief: Belief
}

/**
 * Whether the statement carries a belief of its own, rather than none
 * or the belief of the proposition set it belongs to.
 * @category Assumptions and beliefs
 */
export const isHeldForItself = (assumption: Readonly<Assumption>): boolean =>
    assumption['@annotation']?.belief !== undefined

/**
 * The id of the proposition set the statement belongs to, where its
 * annotation names one instead of carrying a belief.
 * @category Assumptions and beliefs
 */
export const propositionSetOf = (assumption: Readonly<Assumption>): string | undefined => {
    const annotation = assumption['@annotation']
    return annotation && annotation.belief === undefined ? annotation.id : undefined
}

/**
 * The belief the statement is held with in the edition: its own, or
 * that of the proposition set it belongs to.
 * @category Assumptions and beliefs
 */
export const beliefIn = (
    edition: { propositionSets?: readonly PropositionSet[] },
    assumption: Readonly<Assumption>
): Belief | undefined => {
    const own = assumption['@annotation']?.belief
    if (own) return own
    const set = propositionSetOf(assumption)
    return set === undefined ? undefined : edition.propositionSets?.find(candidate => candidate.id === set)?.belief
}

/**
 * The certainty the statement is held with in the edition: that of its
 * own belief, or of the proposition set it belongs to. One that carries
 * neither is stated plainly, and so held true.
 * @category Assumptions and beliefs
 */
export const certaintyIn = (
    edition: { propositionSets?: readonly PropositionSet[] },
    assumption: Readonly<Assumption>
): Certainty => beliefIn(edition, assumption)?.certainty ?? 'true'

/**
 * A value assumption wraps a literal value, e.g. a string, a number, a date, with an optional annotation.
 * Used for properties where the value itself may be uncertain,
 * e.g. dates.
 * @category Format types
 */
export interface ValueAssumption<ValueT> extends Assumption {
    /**
     * The assumed value.
     */
    '@value': ValueT
}

/**
 * A reference assumption wraps a reference (by `@id`) with an optional annotation.
 * Used when pointing to another entity whose association may be uncertain.
 * @category Format types
 */
export type ReferenceAssumption = Assumption & WithId

/**
 * An object assumption wraps a complex object with an optional annotation.
 * Used for structured values (e.g. persons, conditions) whose properties
 * may be uncertain.
 * @category Format types
 */
export type ObjectAssumption<O extends object> =  Assumption & O

/**
 * An actor assignment associates a person with an action.
 * It is an object assumption so that the attribution can be
 * annotated with a belief about its certainty.
 * @category Format types
 */
export type ActorAssignment = ObjectAssumption<Person>

// The day an event falls within; a member of `TimeSpan`, which describes it.
/** @inline */
interface DateWithin {
    /**
     * The day the event falls within.
     * @format date
     * @see crm:P82 at some time within
     */
    within: Date
}

// The bounds an event lies between, the earlier one known; a member of `TimeSpan`.
/** @inline */
interface DateAfter {
    /**
     * The earliest day the event can have happened on: it did not
     * happen before it.
     * @format date
     * @see crm:P82a begin of the begin
     */
    after: Date

    /**
     * The latest day the event can have happened on: it did not
     * happen after it.
     * @format date
     * @see crm:P82b end of the end
     */
    before?: Date
}

// The bounds an event lies between, the later one known; a member of `TimeSpan`.
/** @inline */
interface DateBefore {
    /**
     * The earliest day the event can have happened on: it did not
     * happen before it.
     * @format date
     * @see crm:P82a begin of the begin
     */
    after?: Date

    /**
     * The latest day the event can have happened on: it did not
     * happen after it.
     * @format date
     * @see crm:P82b end of the end
     */
    before: Date
}

/**
 * When something happened: the day it falls `within`, or the bounds it
 * lies between. A bound nobody can give is left out, so `after` alone
 * says "not before".
 * @see crm:E52 Time-Span
 * @category Format types
 */
export type TimeSpan = DateWithin | DateAfter | DateBefore

/**
 * When something happened, as far as the edition can state it, and as
 * an assumption, so that a dating can carry the belief it rests on: the
 * day it falls `within`, or the bounds it lies between. A bound nobody
 * can give is left out, so `after` alone says "not before".
 * @see crm:E52 Time-Span
 * @category Format types
 */
export type DateAssignment = Assumption & TimeSpan

/**
 * The value the assumption holds, without the belief about it.
 * @category Assumptions and beliefs
 */
export function valueOf<ValueT>(
    assumption: ValueAssumption<ValueT>
): ValueT {
    return assumption['@value']
}

/**
 * The values the assumptions hold, in their order.
 * @category Assumptions and beliefs
 */
export function valuesOf<ValueT>(
    assumptions: ValueAssumption<ValueT>[]
): ValueT[] {
    return assumptions.map(a => a['@value'])
}

/**
 * The id of the entity the reference points to.
 * @category Lookups
 */
export function idOf(
    assumption: ReferenceAssumption
): string {
    return assumption.id
}

/**
 * The ids of the entities the references point to, in their order.
 * @category Lookups
 */
export function idsOf(
    assumptions: ReferenceAssumption[]
): string[] {
    return assumptions.map(a => a.id)
}

/**
 * The value stated plainly: an assumption that carries no belief, and
 * so is held true.
 * @category Assumptions and beliefs
 */
export function assignValue<ValueT>(
    value: ValueT
): ValueAssumption<ValueT> {
    return {
        '@value': value
    }
}

/**
 * A reference to the entity with the id, stated plainly: an assumption
 * that carries no belief, and so is held true.
 * @category Assumptions and beliefs
 */
export function assignReference(
    id: string
): ReferenceAssumption {
    return {
        id
    }
}

/**
 * The object stated plainly: an assumption that carries no belief, and
 * so is held true. The object given is copied rather than changed.
 * @category Assumptions and beliefs
 */
export function assignObject<O extends object>(
    obj: O
): ObjectAssumption<O> {
    return {
        ...obj
    }
}

/**
 * A date the edition states: the day the event falls within.
 * @category Assumptions and beliefs
 */
export const assignDate = (within: Date): DateAssignment => ({ within })

/**
 * A date the edition can only bound from below, as in "not before 1924".
 * @category Assumptions and beliefs
 */
export const notBefore = (after: Date): DateAssignment => ({ after })

/**
 * A date the edition can only bound from above.
 * @category Assumptions and beliefs
 */
export const notAfter = (before: Date): DateAssignment => ({ before })

/**
 * The day the event falls within, where the edition states one.
 * @category Assumptions and beliefs
 */
export const dateOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : undefined

/**
 * The earliest the event can have happened, as far as the edition states it.
 * @category Assumptions and beliefs
 */
export const earliestOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : assignment.after

/**
 * The latest the event can have happened, as far as the edition states it.
 * @category Assumptions and beliefs
 */
export const latestOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : assignment.before

