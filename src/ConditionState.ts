import { WithType } from "./utils";

/**
 * Physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation).
 */
export interface ConditionState<T extends string> extends WithType<T> {
    /**
     * A free-text description of the condition, providing
     * details beyond the type classification.
     * @see crm:P3 has note
     */
    description?: string;
}
