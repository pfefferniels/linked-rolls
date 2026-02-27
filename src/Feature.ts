import { ObjectAssumption } from "./Assumption";
import { ConditionState } from "./ConditionState";
import { Text } from "./Symbol";
import { PartialBy, WithId, WithType } from "./utils";

/**
 * Describes the horizontal extent of a feature on the roll,
 * measured in millimeters from the beginning of the roll.
 * The `from` value is the start position and `to` is the end position.
 */
export interface HorizontalSpan {
    /**
     * The unit of measurement for horizontal positions.
     * Always 'mm' (millimeters).
     * @see crm:P91 has unit
     */
    unit: 'mm';
    /**
     * The start position of the feature in millimeters
     * from the beginning of the roll.
     */
    from: number;
    /**
     * The end position of the feature in millimeters
     * from the beginning of the roll.
     */
    to: number;
}

/**
 * Describes the vertical extent of a feature on the roll,
 * measured in track numbers. Track numbers correspond to
 * positions on the tracker bar.
 */
export interface VerticalSpan {
    /**
     * The unit of measurement for horizontal positions.
     * @see crm:P91 has unit
     */
    unit: 'track';
    /**
     * The start track number of the feature.
     */
    from: number;
    /**
     * The end track number, if the feature spans multiple tracks.
     * If omitted, the feature occupies a single track.
     */
    to?: number
}

export const featureTypes = ['Hole', 'Writing', 'Mark', 'GluedOn'] as const;

export type FeatureType = typeof featureTypes[number];

/**
 * A physical feature on the roll, e.g. a perforation, a tear, a mark, etc.,
 * defined by its horizontal and vertical position and extent.
 * @see reo:C2 Feature
 */
export interface RollFeature<T extends FeatureType, DamageT extends string> extends WithId, WithType<T> {
    /**
     * IIIF region pointing to a depiction of this feature in the scan.
     * @see crm:P62 is depicted by
     */
    depiction?: string;

    /**
     * Horizontal span of the feature on the roll.
     * @see crm:P43 has dimension
     */
    horizontal: HorizontalSpan;

    /**
     * Vertical span of the feature on the roll.
     * @see crm:P43 has dimension
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

/**
 * A hole (perforation) in the roll paper. Holes are the primary
 * carriers of musical information on piano rolls, as they trigger
 * notes and expression controls when passing over the tracker bar.
 */
export interface Hole extends RollFeature<'Hole', typeof conditions.Hole[number]> {
    /**
     * The punching pattern of the hole. Regular holes have evenly-spaced
     * bridges, accelerating holes have decreasing bridge widths, and
     * staggering holes alternate between adjacent tracks (cf. Phillips).
     */
    pattern?: 'regular' | 'accelerating' | 'staggering';
}

/**
 * A trace is a visible mark or writing on the roll surface.
 * Traces may fade over time.
 */
export interface Trace<T extends FeatureType> extends RollFeature<T, typeof conditions.Mark[number]> { }

export const writingMethods = ['Print', 'Handwriting', 'Stamp'] as const;

/**
 * The method by which a writing was produced on the roll:
 * printed, handwritten, or stamped.
 */
export type WritingMethod = typeof writingMethods[number];

/**
 * A piece of writing found on the roll, such as a label,
 * catalogue number, or annotation. Writings have a method
 * of production and a transcription of their content.
 */
export interface Writing extends Trace<'Writing'> {
    /**
     * The method by which this writing was produced
     * (e.g. through print, handwriting, or stamping).
     */
    method: WritingMethod;

    /**
     * A transcription of the text content of the writing.
     * This is an object assumption so that the transcription
     * can be annotated with a belief about its correctness.
     */
    transcription: ObjectAssumption<Omit<Text, 'carriers'>>;
}

/**
 * A visible mark on the roll, such as a pencil mark,
 * ink mark, or other non-textual annotation.
 */
export interface Mark extends Trace<'Mark'> { }

/**
 * A piece of material (paper or tape) glued onto the roll surface.
 * Glued-on features are typically used to cover perforations (for corrections)
 * or to reinforce damaged areas. They may themselves carry other features
 * such as writings or additional holes.
 */
export interface GluedOn extends RollFeature<'GluedOn', typeof conditions.GluedOn[number]> {
    /**
     * The material of the glued-on feature.
     * @see crm:P45 consists of
     */
    material: 'Paper' | 'Tape';

    /**
     * A glued-on feature itself may carry other features.
     * Nested features do not need to be positioned explicitly.
     * @see crm:P56 bears feature
     */
    features?: PartialBy<AnyFeature, 'horizontal' | 'vertical'>[];
}

/**
 * The union of all physical feature types that can appear on a roll:
 * holes (perforations), writings (labels, annotations), marks (pencil, ink),
 * and glued-on patches (paper, tape).
 */
export type AnyFeature = Hole | Writing | Mark | GluedOn;

export const isRollFeature = (obj: object): obj is AnyFeature => {
    return 'type' in obj && featureTypes.includes(obj.type as FeatureType);
}
