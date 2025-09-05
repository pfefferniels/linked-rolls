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

export interface Argumentation<T extends string = 'simpleArgumentation'> extends WithActor, WithNote {
    type: T
}

export interface MeaningComprehension extends Argumentation<'meaningComprehension'> {
    comprehends: string[]
}

export interface Inference extends Argumentation<'inference'> {
    premises: string[]
}

export interface BeliefAdoption extends Argumentation<'beliefAdoption'> {
    note: string;
}

export type AnyArgumentation = MeaningComprehension | Inference | BeliefAdoption | Argumentation

export interface Belief extends WithId {
    type: 'belief';
    certainty: Certainty;
    reasons: AnyArgumentation[]
}

/**
 * An editorial assumpton is always a One-Proposition Set.
 */
export interface EditorialAssumption<Name, AssignedType> extends WithId {
    // TODO: this should be called propertyType or something similar
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

export interface Motivation<MotivationT> extends EditorialAssumption<'motivationAssignment', MotivationT> { }

export const isMotivation = (object: any): object is Motivation<any> => {
    return 'type' in object && object.type === 'motivationAssignment'
}
