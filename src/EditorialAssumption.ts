import { WithId } from "./WithId";
import { RollFeature } from "./Feature";
import { AnySymbol } from "./Symbol";
import { Stage } from "./Stage";

export type Certainty = 'true' | 'likely' | 'possible' | 'unlikely' | 'false';

export type WithActor = {
    actor?: string // P14 carried out by
}

export type WithNote = {
    note?: string // P3 has note
}

/**
 * This equals to CRMinf I5 Inference Making
 */
export interface Inference extends WithActor, WithNote {
    type: 'inference';
    premises: AnyEditorialAssumption[]; // used as premise
    logic?: string
}

/**
 * This equals to CRMinf I7 Belief Adoption
 */
export interface Reference extends WithActor, WithNote {
    type: 'reference';
}

/**
 * This equals to CRMsci S4 Observation
 */
export interface Observation extends WithActor, Required<WithNote> {
    type: 'observation';
    observed?: AnySymbol[];
}

export type AnyArgumentation = Inference | Reference | Observation

/**
 * An editorial assumpton is an I2 Belief *and* I4 Proposition Set
 */
export interface EditorialAssumption<T> extends WithId {
    type: T;
    certainty: Certainty, // held to be
    reasons?: AnyArgumentation[]; // was concluded by
}

export function isEditorialAssumption(obj: any): obj is AnyEditorialAssumption {
    return obj && typeof obj === 'object' && 'type' in obj && 'certainty' in obj;
}

export const emendationMotivation = [
    'failed-perforation',
    'torn-perforation',
    'vertical-displacement'
] as const 

export type EmendationMotivation = typeof emendationMotivation[number];

export interface Emendation<T> extends EditorialAssumption<T>, WithNote {
    motivation: EmendationMotivation;
}

export interface Replacement extends Emendation<'replacement'>, WithNote {
    replaced: RollFeature[]; // P140 assigned attribute to
    with: RollFeature[]; // P141 assigned
}

export type DimensionMarker = {
    point: 'start' | 'end';
    of: RollFeature;
}

type PlacementType = 'after' | 'before' | 'with';

// reo:Constraint, subclass of E13 Attribute Assignment
export interface Constraint extends Emendation<'constraint'> {
    placed: DimensionMarker;
    placement: PlacementType;
    relativeTo: DimensionMarker | {
        number: number;
        unit: string 
    };
}

export type AnyEmendation = 
    | Constraint
    | Replacement

export interface Derivation extends EditorialAssumption<'derivation'> {
    predecessor: Stage
}

export const editMotivations = [
    /**
     * An additional accent that can only be encoded with 
     * sforzando on/off due to the short space left between
     * the notes to be differentiated.
     */
    'short-dynamic-differentation',
    'additional-accent',
    'add-redundancy',
    'remove-redundancy',
    'replace-with-equivalent',
    'shift',
    'correct-error',
    'shorten',
    'prolong',
] as const;

export type EditMotivation = typeof editMotivations[number];

export interface Edit extends EditorialAssumption<'edit'> {
    motivation?: EditMotivation
    insert?: AnySymbol[];
    delete?: AnySymbol[];
}

export interface TempoAdjustment extends EditorialAssumption<'tempoAdjustment'> {
    adjusts: string;
    startsWith: number;
    endsWith: number;
}

/**
 * Stretch a roll copy so that it can be collated with others.
 * The note property should reflect about the relationship between
 * the roll condition, its physical properties, and the assumed
 * stretching.
 */
export interface Stretch extends EditorialAssumption<'stretch'> {
    factor: number;
}

/**
 * Shift a copy so that it can be collated with others.
 */
export interface Shift extends EditorialAssumption<'shift'> {
    vertical: number;
    horizontal: number;
}

export interface Intention extends EditorialAssumption<'intention'> {
    description: string;
}

/**
 * Modelled on IAM's Question, cf. M. Doerr et al., p. 12
 */
export interface Question extends EditorialAssumption<'question'> {
    question: string // has conclusion (W)
}

export type AnyEditorialAssumption =
    AnyEmendation |
    Edit |
    Question |
    TempoAdjustment |
    Stretch |
    Shift |
    Derivation |
    Intention;

