/**
 * Describes the physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation). 
 */

export interface ConditionState<T extends string> {
    type: T;
    description?: string;
}
