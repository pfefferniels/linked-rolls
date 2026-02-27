import { WithActor, WithNote, WithId } from "./utils"

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
     * References (by `@id`) to the beliefs or facts
     * from which the conclusion is drawn.
     * @see crminf:J1 used as premise
     */
    premises: string[]
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
     * @see crminf:J2 was concluded by
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
        belief: Belief;
    }
}

/**
 * A value assumption wraps a literal value, e.g. a string, a number, a date, with an optional annotation.
 * Used for properties where the value itself may be uncertain,
 * e.g. dates or alignment references.
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

