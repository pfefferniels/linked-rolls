import { WithNote, WithId } from "./utils.js"
import { Person, WithActor } from "./Agent.js"

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
 */
export type Certainty = typeof certainties[number];

/**
 * Whether a statement held with this certainty is stated as a fact when
 * the edition is read as RDF. One held possible, unlikely or false is
 * only quoted, so that a reader who leaves the beliefs aside does not
 * take a doubted statement for the edition's own.
 */
export const isAsserted = (certainty: Certainty): boolean =>
    certainty === 'true' || certainty === 'likely'

/** The certainty a statement is held with. One that carries no belief is stated plainly, and so held true. */
export const certaintyOf = (assumption: Readonly<Assumption>): Certainty =>
    assumption['@annotation']?.belief.certainty ?? 'true'

/**
 * An argumentation provides reasons for a belief and
 * may be associated with a person carrying out that argumentation.
 * @see crminf:I1 Argumentation
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
 */
export interface Inference extends Argumentation<'inference'> {
    /**
     * References (by `@id`) to the beliefs
     * from which the conclusion is drawn.
     * @see crminf:J1 used as premise
     */
    premises: string[]

    /**
     * References (by `@id`) to what the inference worked on besides
     * beliefs, such as the versions it compared or the analysis output
     * it cites.
     * @see crm:P16 used specific object
     */
    used?: string[]
}

/**
 * A belief adoption adopts someone else's belief. This type is used
 * to indicate e.g. knowledge through private communication or
 * from secondary literature.
 * @see crminf:I7 Belief Adoption
 */
export interface BeliefAdoption extends Argumentation<'beliefAdoption'> {
    /**
     * A note describing the source of the adopted belief,
     * e.g. a bibliographic reference or personal communication.
     * @see crm:P3 has note
     */
    note: string;
}

/**
 * An argumentation can be either a plain argumentation, a
 * meaning comprehension, an inference, or a belief adoption.
 */
export type AnyArgumentation = MeaningComprehension | Inference | BeliefAdoption | Argumentation

/**
 * A belief is a temporal object and associates a proposition (i.e.
 * a statement) with a certainty. It comes into existence through
 * argumentations (reasons).
 * @see crminf:I2 Belief
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
 */
export interface Assumption {
    /**
     * An optional annotation expressing a belief about this assumption.
     * Uses the JSON-LD-star `@annotation` mechanism to attach
     * epistemic metadata (certainty and reasons) to any triple.
     */
    '@annotation'?: WithId & {
        /**
         * The belief held about the annotated statement.
         * @see crminf:J4i is subject of
         */
        belief: Belief;
    }
}

/**
 * A value assumption wraps a literal value, e.g. a string, a number, a date, with an optional annotation.
 * Used for properties where the value itself may be uncertain,
 * e.g. dates.
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
 */
export type ReferenceAssumption = Assumption & WithId

/**
 * An object assumption wraps a complex object with an optional annotation.
 * Used for structured values (e.g. persons, conditions) whose properties
 * may be uncertain.
 */
export type ObjectAssumption<O extends object> =  Assumption & O

/**
 * An actor assignment associates a person with an action.
 * It is an object assumption so that the attribution can be
 * annotated with a belief about its certainty.
 */
export type ActorAssignment = ObjectAssumption<Person>

/**
 * When something happened, as far as the edition can state it: the day
 * it falls `within`, or the bounds it lies between. A bound nobody can
 * give is left out, so `after` alone says "not before".
 * @see crm:E52 Time-Span
 */
export type DateAssignment = Assumption & (
    | { within: Date }
    | { after: Date, before?: Date }
    | { before: Date, after?: Date }
)

export function valueOf<ValueT>(
    assumption: ValueAssumption<ValueT>
): ValueT {
    return assumption['@value']
}

export function valuesOf<ValueT>(
    assumptions: ValueAssumption<ValueT>[]
): ValueT[] {
    return assumptions.map(a => a['@value'])
}

export function idOf(
    assumption: ReferenceAssumption
): string {
    return assumption.id
}

export function idsOf(
    assumptions: ReferenceAssumption[]
): string[] {
    return assumptions.map(a => a.id)
}

export function assignValue<ValueT>(
    value: ValueT
): ValueAssumption<ValueT> {
    return {
        '@value': value
    }
}

export function assignReference(
    id: string
): ReferenceAssumption {
    return {
        id
    }
}

export function assignObject<O extends object>(
    obj: O
): ObjectAssumption<O> {
    return {
        ...obj
    }
}

/** A date the edition states: the day the event falls within. */
export const assignDate = (within: Date): DateAssignment => ({ within })

/** A date the edition can only bound from below, as in "not before 1924". */
export const notBefore = (after: Date): DateAssignment => ({ after })

/** A date the edition can only bound from above. */
export const notAfter = (before: Date): DateAssignment => ({ before })

/** The day the event falls within, where the edition states one. */
export const dateOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : undefined

/** The earliest the event can have happened, as far as the edition states it. */
export const earliestOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : assignment.after

/** The latest the event can have happened, as far as the edition states it. */
export const latestOf = (assignment: DateAssignment): Date | undefined =>
    'within' in assignment ? assignment.within : assignment.before

