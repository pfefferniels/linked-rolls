import { WithActor, WithNote, WithId } from "./utils"

export const certainties = [
    'true',
    'likely',
    'possible',
    'unlikely',
    'false'
] as const;

/**
 * Certainty levels for beliefs.
 */
export type Certainty = typeof certainties[number];

/**
 * An argumentation provides reasons for a belief and 
 * may be associated with an person carrying out that argumentation.
 */
export interface Argumentation<T extends string = 'simpleArgumentation'> extends WithActor, WithNote {
    type: T
}

/**
 * A meaning comprehension interprets or disambiguates the meaning of 
 * symbols or features. 
 */
export interface MeaningComprehension extends Argumentation<'meaningComprehension'> {
    comprehends: string[]
}

/**
 * An inference draws a conclusion from given premises.
 */
export interface Inference extends Argumentation<'inference'> {
    premises: string[]
}

/**
 * A belief adoption adopts someone else's belief. This type is used 
 * to indicate e.g. knowledge through private communication or
 * from secondary literature.
 */
export interface BeliefAdoption extends Argumentation<'beliefAdoption'> {
    note: string;
}

/**
 * An argumentation can be either a plain argumentation, a
 * meaning comprehension,  an inference, or a belief adoption.
 */
export type AnyArgumentation = MeaningComprehension | Inference | BeliefAdoption | Argumentation

/**
 * A belief associates a certainty with an assumption and provides
 * reasons for it.
 */
export interface Belief extends WithId {
    type: 'belief';
    certainty: Certainty;
    reasons: AnyArgumentation[]
}

/**
 * An assumption is the reification of a triple. This leverages the 
 * `@annotation` element from JSON-LD-star.
 */
export interface Assumption {
    '@annotation'?: WithId & {
        belief: Belief;
    }
}

export interface ValueAssumption<ValueT> extends Assumption {
    '@value': ValueT
}

export type ReferenceAssumption = Assumption & WithId

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

