import { EditorialAssumption } from "./EditorialAssumption";
import { WithId } from "./WithId";

/**
 * Describes the physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation). 
 */

export interface ConditionState<T extends string> extends WithId {
    type: T;
    description?: string;
}

export interface FeatureCondition extends ConditionState<
    'missing-perforation' | 'damaged-perforation' | 'illegible'
> { }

/**
 * This condition state is used to describe to roll's 
 * paper shrinkage or stretching. It might be calculated
 * on the basis of comparing the vertical or horizontal 
 * extent with other witnesses of the same roll.
 */
export interface PaperStretch extends ConditionState<'paper-stretch'> {
    factor: number
}

export type AnyConditionState = FeatureCondition | PaperStretch

/**
 * Documents when and by whom a condition state
 * was assessed.
 */
export interface ConditionAssessment extends EditorialAssumption<'conditionAssessment', AnyConditionState> { }
