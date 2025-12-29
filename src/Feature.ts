import { ObjectAssumption } from "./Assumption";
import { ConditionState } from "./ConditionState";
import { Text } from "./Symbol";
import { PartialBy, WithId, WithType } from "./utils";

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

export const featureTypes = ['Hole', 'Writing', 'Mark', 'GluedOn'] as const;

export type FeatureType = typeof featureTypes[number];

/**
 * A feature on the roll, e.g. a perforation, a tear, a mark, etc., 
 * defined by its horizontal and vertical position and extent.
 */
export interface RollFeature<T extends FeatureType, DamageT extends string> extends WithId, WithType<T> {
    /**
     * IIIF region in string form.
     * Maps to 
     */
    depiction?: string;

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

export const conditions = {
    Hole: ['partially-torn', 'missing-perforation'],
    Writing: ['illegible'],
    Mark: ['faded'],
    GluedOn: ['detaching', 'ripped']
} as const satisfies Record<FeatureType, readonly string[]>;

export interface Hole extends RollFeature<'Hole', typeof conditions.Hole[number]> {
    pattern?: 'regular' | 'accelerating' | 'staggering';
}

export interface Trace<T extends FeatureType> extends RollFeature<T, typeof conditions.Mark[number]> { }

export const writingMethods = ['Print', 'Handwriting', 'Stamp'] as const;
export type WritingMethod = typeof writingMethods[number];

export interface Writing extends Trace<'Writing'> {
    method: WritingMethod;
    transcription: ObjectAssumption<Omit<Text, 'carriers'>>;
}

export interface Mark extends Trace<'Mark'> { }

export interface GluedOn extends RollFeature<'GluedOn', typeof conditions.GluedOn[number]> {
    /**
     * The material of the glued-on feature.
     * Maps to crm:P45 consists of.
     */
    material: 'Paper' | 'Tape';

    /**
     * A glued-on feature itself may carry other features.
     * Nested features do not need to be positioned explicitly.
     * 
     * Maps to crm:P56 bears feature.
     */
    features?: PartialBy<AnyFeature, 'horizontal' | 'vertical'>[];
}

export type AnyFeature = Hole | Writing | Mark | GluedOn;

export const isRollFeature = (obj: object): obj is AnyFeature => {
    return 'type' in obj && featureTypes.includes(obj.type as FeatureType);
}
