import { EditorialAssumption } from "./EditorialAssumption";
import { WithId } from "./WithId";

/**
 * Describes the physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation). 
 */

export interface ConditionState extends WithId {
    type?: 'failed-single-perforation' | 'teared' | 'damaged-perforation';
    description?: string;
}

/**
 * Documents when and by whom a condition state
 * was assessed.
 */
export interface ConditionAssessment extends EditorialAssumption<'conditionAssessment', ConditionState> { }
