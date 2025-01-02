import { RollCopy } from "./RollCopy";
import { WithId, AnyRollEvent, CollatedEvent, Hand, PreliminaryRoll } from "./types";

/**
 * Is an I2 Belief and I4 Proposition Set
 * @todo rename to EditorialAssumption, as not to suggest that it
 * should be a temporal event. It comes to live through argumentation,
 * and that's the temporal event.
 */
export interface EditorialAssumption<T> extends WithId {
    type: T;
    certainty: 'true' | 'likely' | 'unlikely' | 'false', // held to be
    argumentation: { // was concluded by => Argumentation
        actor: string // P14 carried out by
        premises: string[] // has note
    }
}

export interface Conjecture extends EditorialAssumption<'conjecture'> {
    replaced: AnyRollEvent[];
    with: AnyRollEvent[];
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
    contains: CollatedEvent[];
    action?: 'insert' | 'delete';
    follows?: Edit;
}

export interface RelativePlacement extends EditorialAssumption<'relativePlacement'> {
    placed: CollatedEvent;
    relativeTo: CollatedEvent[];
    withPlacementType: 'startsBeforeTheStartOf' | 'startsBeforeTheEndOf';
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

export type AnyEditorialAction =
    Conjecture |
    Edit |
    Annotation |
    HandAssignment |
    TempoAdjustment |
    RelativePlacement |
    Stretch |
    Shift |
    ObjectUsage;

