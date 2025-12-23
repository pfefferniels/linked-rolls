import { ObjectAssumption } from "./Assumption";
import { ConditionState } from "./ConditionState";
import { WithId, WithType } from "./utils";

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
export interface RollFeature<T extends string, DamageT extends string> extends WithId, WithType<T> {
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
     * This can be used e.g. to indicate a perforation
     * which is torn out or in any other way damaged.
     */
    condition?: ObjectAssumption<ConditionState<DamageT>>;
}

export interface Hole extends RollFeature<'Hole', 'missing-perforation' | 'damaged-perforation'> { }

export interface Mark extends RollFeature<'Mark', 'faded'> { }

export interface GluedOn extends RollFeature<'GluedOn', 'detaching' | 'ripped'> {
    /**
     * The material of the glued-on feature.
     */
    material: 'paper' | 'tape';
}

export type AnyFeature = Hole | Mark | GluedOn;

export const isRollFeature = (obj: object): obj is RollFeature<string, string> => {
    return 'horizontal' in obj && 'vertical' in obj;
}
