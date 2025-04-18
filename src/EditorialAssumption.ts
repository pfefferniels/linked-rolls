import { RollCopy } from "./RollCopy";
import { WithId } from "./WithId";
import { AnyRollEvent } from "./RollEvent";
import { CollatedEvent } from "./Collation";
import { PreliminaryRoll } from "./Edition";

export type Certainty = 'true' | 'likely' | 'possible' | 'unlikely' | 'false';

/**
 * Argumentations, simplified in the form of
 * multiple instantation of Inference Making, Belief Adoption and Observation.
 * This is a shortcut for explicit P9 consists of.
 */
export type Argumentation = {
    actor: string // P14 carried out by
    premises: AnyEditorialAssumption[] // (consists of) -> Inference Making -> used as premise
    adoptedBeliefs: string[] // (consists of) -> Belief Adoption -> adopted belief
    observations: string[] // (consists of) -> Observation -> has note
    note?: string // why do the premises, adopted beliefs, or observations lead to the conclusion
}

/**
 * An editorial assumpton is an I2 Belief and I4 Proposition Set
 */
export interface EditorialAssumption<T> extends WithId {
    type: T;
    certainty: Certainty, // held to be
    argumentation: Argumentation // was concluded by => Argumentation
}

export function isEditorialAssumption(obj: any): obj is AnyEditorialAssumption {
    return obj && typeof obj === 'object' && 'type' in obj && 'certainty' in obj && 'argumentation' in obj;
}

export interface Conjecture extends EditorialAssumption<'conjecture'> {
    replaced: AnyRollEvent[];
    with: AnyRollEvent[];
}

/**
 * This type is modelled on E11 Modification
 */
export interface Hand extends WithId {
    carriedOutBy: string
    date: string
    note?: string
    authorised?: boolean
}

/**
 * Assigns a hand ("Bearbeitungsschicht") to one or many
 * roll events with a given certainty.
 */
export interface HandAssignment extends EditorialAssumption<'handAssignment'> {
    hand: Hand;
    target: AnyRollEvent[];
}

// rollo:Object Usage, sub class of E13 Attribute Assignment
// with assigned attribute of type = P16 used specific object
export interface ObjectUsage extends EditorialAssumption<'objectUsage'> {
    original: PreliminaryRoll | Stage // P141 assigned
}

export interface Stage {
    siglum: string; // P149 is identified by (Conceptual Object Apellation)
    witnesses: RollCopy[]; // R7i has example
}

export interface Edit extends EditorialAssumption<'edit'> {
    insert?: CollatedEvent[];
    delete?: CollatedEvent[];
}

type DimensionMarker = {
    point: 'start' | 'end';
    of: AnyRollEvent;
}

type PlacementType = 'after' | 'before' | 'with';

// rolo:Horizontal Placement, subclass of E13 Attribute Assignment
export interface HorizontalPlacement extends EditorialAssumption<'horizontalPlacement'> {
    placed: DimensionMarker;
    placement: PlacementType;
    relativeTo: DimensionMarker | {
        number: string;
        unit: string 
    };
}

export interface Annotation extends EditorialAssumption<'annotation'> {
    annotated: CollatedEvent[];
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

export type AnyEditorialAssumption =
    Conjecture |
    Edit |
    Annotation |
    HandAssignment |
    TempoAdjustment |
    HorizontalPlacement |
    Stretch |
    Shift |
    ObjectUsage;

