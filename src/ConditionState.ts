import { WithType } from "./utils";

/**
 * Physical condition of a roll or
 * of a feature on the roll (e.g. a damaged
 * or unsuccessful perforation).
 * @see crm:E3 Condition State
 */
export interface ConditionState<T extends string> extends WithType<'ConditionState'> {
    /**
     * The kind of condition, from the list the roll or
     * the kind of feature allows.
     * @see crm:P2 has type
     */
    conditionType: T

    /**
     * A free-text description of the condition, providing
     * details beyond the type classification.
     * @see crm:P3 has note
     */
    description?: string;
}
