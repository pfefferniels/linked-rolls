import { ObjectAssumption } from "./Assumption";
import { ConditionState } from "./ConditionState";
import { WithId } from "./utils";

export interface FeatureCondition extends ConditionState<
    'missing-perforation' | 'damaged-perforation' | 'illegible'
> { }

export type FeatureConditionAssignment = ObjectAssumption<FeatureCondition>;

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

/**
 * A feature on the roll, e.g. a perforation, a tear, a mark, etc., 
 * defined by its horizontal and vertical position and extent.
 */
export interface RollFeature extends WithId {
    /**
     * IIIF region in string form.
     */
    annotates?: string;

    /**
     * Horizontal span of the feature on the roll.
     * Usually given in millimeters.
     */
    horizontal: HorizontalSpan;

    /**
     * Vertical span of the feature on the roll.
     * Usually given in track numbers.
     */
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
    condition?: FeatureConditionAssignment
}

export const isRollFeature = (obj: object): obj is RollFeature => {
    return 'horizontal' in obj && 'vertical' in obj;
}
