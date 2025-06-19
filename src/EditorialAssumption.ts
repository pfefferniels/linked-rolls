import { WithId } from "./WithId";
import { Person } from "./Edition";
import { v4 } from "uuid";

export const certainties = [
    'true',
    'likely',
    'possible',
    'unlikely',
    'false'
] as const;
export type Certainty = typeof certainties[number];

export type WithActor = {
    actor?: Person // P14 carried out by
}

export type WithNote = {
    note?: string // P3 has note
}

export interface Argumentation extends WithActor, WithNote {
    motivation?: Question
}

export interface MeaningComprehension<T> extends WithActor, WithNote {
    comprehends: T[]
}

export const isMeaningComprehension = <T,>(
    arg: Argumentation,
    aboutGuard: (obj: any) => obj is T
): arg is MeaningComprehension<T> => {
    return 'comprehends' in arg
        && Array.isArray(arg.comprehends)
        && arg.comprehends.every(aboutGuard);
}

export interface Inference extends Argumentation {
    premises: Belief[]
}

export const isInference = (arg: Argumentation): arg is Inference => {
    return 'premises' in arg;
}

export interface Belief extends WithId {
    type: 'belief';
    certainty: Certainty;
    reasons: Argumentation[]
}

/**
 * An editorial assumpton is always a One-Proposition Set.
 */
export interface EditorialAssumption<Name, AssignedType> extends WithId {
    type: Name;
    assigned: AssignedType,
    belief?: Belief
}

export function flat<Name, Type>(
    assumption: EditorialAssumption<Name, Type>
): Type

export function flat<Name, Type>(
    assumption: EditorialAssumption<Name, Type>[]
): Type[]

export function flat<Name, Type>(
    assumption:
        | EditorialAssumption<Name, Type>
        | EditorialAssumption<Name, Type>[]
): Type | Type[] {
    return Array.isArray(assumption)
        ? assumption.map(a => a.assigned)
        : assumption.assigned
}

export function assign<Type extends string, T>(type: Type, object: T): EditorialAssumption<Type, T> {
    return {
        type,
        id: v4(),
        assigned: object
    }
}

export type DimensionMarker = {
    point: 'start' | 'end';
    of: Symbol;
}

type PlacementType = 'after' | 'before' | 'with';

// reo:Constraint, subclass of E13 Attribute Assignment
export interface Constraint {
    placed: DimensionMarker;
    placement: PlacementType;
    relativeTo: DimensionMarker | {
        number: number;
        unit: string
    };
}

export interface Motivation extends EditorialAssumption<'motivationAssignment', string> { }

export const isMotivation = (object: any): object is Motivation => {
    return 'type' in object && object.type === 'motivationAssignment'
}

export interface QuestionMaking extends WithActor {
    premise: Belief | Question; // has premise
}

/**
 * Modelled on IAM's Question, cf. M. Doerr et al., p. 12
 */
export interface Question {
    question: string // has conclusion (W)
    making: {
        premises: Belief[]
    }
}
