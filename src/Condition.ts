import { WithId } from "./WithId";

/**
 * Describes the physical condition of a roll
 * in a certain time period or time point. It
 * also documents the responsible person who
 * assessed the roll's condition.
 */

export interface ConditionState extends WithId {
    note: string;
    date: string;
    assessment: ConditionAssessment;
}

export interface ConditionAssessment extends WithId {
    carriedOutBy: string;
    date: string;
}
