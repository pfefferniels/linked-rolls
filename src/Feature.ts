import { ConditionState } from "./ConditionState";
import { EditorialAssumption } from "./EditorialAssumption";
import { WithId } from "./WithId";

export interface FeatureCondition extends ConditionState<
    'missing-perforation' | 'damaged-perforation' | 'illegible'
> { }

export type FeatureConditionAssignment = EditorialAssumption<'conditionAssignment', FeatureCondition>;

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
    condition?: FeatureConditionAssignment
}

export const isRollFeature = (obj: object): obj is RollFeature => {
    return 'horizontal' in obj && 'vertical' in obj;
}
