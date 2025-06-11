import { ConditionState } from "./Condition";
import { RollMeasurement } from "./Measurement";
import { WithId } from "./WithId";

export interface HorizontalSpan {
    unit: 'mm';
    from: number;
    to: number;
}

export interface VerticalSpan {
    unit: 'track';
    from: number;
    to?: number
}

export interface RollFeature extends WithId {
    /**
     * IIIF region in string form.
     */
    annotates?: string;

    horizontal: HorizontalSpan;
    vertical: VerticalSpan;

    /**
     * Describes whether the event takes place
     * on the verso or recto side of the roll.
     * Since the same perforation is present on both
     * sides, this property is left optional for now.
     */
    side?: 'verso' | 'recto';

    /**
     * This can be used e.g. to indicate a perforation
     * which is torn out or in any other way damaged.
     */
    condition?: ConditionState

    measurement: RollMeasurement // L20i was created by
}
