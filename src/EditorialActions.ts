import { WithId, AnyRollEvent, CollatedEvent, Hand } from "./types";

export type Certainty = 'high' | 'medium' | 'low' | 'unknown';

interface EditorialAction<T> extends WithId {
    type: T;
    carriedOutBy: string;
    certainty?: Certainty;
    note?: string;
}

export interface Conjecture extends EditorialAction<'conjecture'> {
    replaced: AnyRollEvent[];
    with: AnyRollEvent[];
}

/**
 * Assigns a hand ("Bearbeitungsschicht") to one or many
 * roll events with a given certainty.
 */
export interface HandAssignment extends EditorialAction<'handAssignment'> {
    hand: Hand;
    target: AnyRollEvent[];
}

export interface EditGroup extends EditorialAction<'editGroup'> {
    contains: CollatedEvent[];
    action?: 'insert' | 'delete';
    follows?: EditGroup;
}

export interface RelativePlacement extends EditorialAction<'relativePlacement'> {
    placed: CollatedEvent;
    relativeTo: CollatedEvent[];
    withPlacementType: 'startsBeforeTheStartOf' | 'startsBeforeTheEndOf';
}

export interface Annotation extends EditorialAction<'annotation'> {
    annotated: CollatedEvent[];
}

export interface TempoAdjustment extends EditorialAction<'tempoAdjustment'> {
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
export interface Stretch extends EditorialAction<'stretch'> {
    factor: number;
}

/**
 * Shift a copy so that it can be collated with others.
 */
export interface Shift extends EditorialAction<'shift'> {
    vertical: number;
    horizontal: number;
}

export type AnyEditorialAction =
    Conjecture |
    EditGroup |
    Annotation |
    HandAssignment |
    TempoAdjustment |
    RelativePlacement |
    Stretch |
    Shift;
