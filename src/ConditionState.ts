import { WithType } from "./utils";

/**
 * Physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation). 
 */
export interface ConditionState<T extends string> extends WithType<T> {
    description?: string;
}
