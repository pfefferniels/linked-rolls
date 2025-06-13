import { WithId } from "./WithId";
import { Person } from "./Edition";
import { Edit } from "./Edit";
import { v4 } from "uuid";

export type Certainty = 'true' | 'likely' | 'possible' | 'unlikely' | 'false';

export type WithActor = {
    actor?: Person // P14 carried out by
}

export type WithNote = {
    note?: string // P3 has note
}

export interface Argumentation extends WithActor, WithNote {
    motivation?: Question
}

export interface Inference extends Argumentation {
    premise: Belief
}

export interface Belief extends WithId {
    type: 'belief';
    certainty: Certainty;
    reasons: Argumentation[]
}

export interface IntendedMeaningBelief<AboutT> extends Belief {
    about: AboutT; // P2 is about
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

interface IntendedMeaning<AboutT> {
    belief: IntendedMeaningBelief<AboutT>
}

// reo:Constraint, subclass of E13 Attribute Assignment
export interface Constraint {
    placed: DimensionMarker;
    placement: PlacementType;
    relativeTo: DimensionMarker | {
        number: number;
        unit: string
    };
}

export interface Intention extends IntendedMeaning<Edit> {
    description: string;
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
        premise: Belief
    }
}
