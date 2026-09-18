import { ObjectAssumption } from "./Assumption.js";
import { ConditionState } from "./ConditionState.js";
import { Text } from "./Symbol.js";
import { PartialBy, WithId, WithType } from "./utils.js";
import { Measure, Millimeters, Track } from "./Quantity.js";

/**
 * Describes the horizontal extent of a feature on the roll,
 * measured in millimeters from the beginning of the roll.
 * The `from` value is the start position and `to` is the end position.
 * @see crm:E54 Dimension
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
     * @see reo:from
     */
    from: Millimeters;
    /**
     * The end position of the feature in millimeters
     * from the beginning of the roll.
     * @see reo:to
     */
    to: Millimeters;
}

/**
 * Describes the vertical extent of a feature on the roll,
 * measured in track numbers. Track numbers correspond to
 * positions on the tracker bar.
 * @see crm:E54 Dimension
 */
export interface VerticalSpan {
    /**
     * The unit of measurement for vertical positions.
     * @see crm:P91 has unit
     */
    unit: 'track';
    /**
     * The start track number of the feature.
     * @see reo:from
     */
    from: Track;
    /**
     * The end track number, if the feature spans multiple tracks.
     * If omitted, the feature occupies a single track.
     * @see reo:to
     */
    to?: Track
}

export const featureTypes = ['Hole', 'Writing', 'Mark', 'GluedOn'] as const;

export type FeatureType = typeof featureTypes[number];

export const isFeatureType = (value: unknown): value is FeatureType =>
    featureTypes.includes(value as FeatureType);

/**
 * A feature on the roll, e.g. a perforation, a writing, a mark or a
 * glued-on patch, defined by its horizontal and vertical position and
 * extent. Each kind of feature is a class of its own, which its type
 * names.
 */
export interface RollFeature<T extends FeatureType, DamageT extends string> extends WithId, WithType<T> {
    /**
     * IIIF region pointing to a depiction of this feature in the scan.
     * @see crm:P138i has representation
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
     * @see crm:P44 has condition
     */
    condition?: ObjectAssumption<ConditionState<DamageT>>;
}

export const conditions = {
    Hole: ['partially-torn', 'missing-perforation'],
    Writing: ['illegible'],
    Mark: ['faded'],
    GluedOn: ['detaching', 'ripped']
} as const satisfies Record<FeatureType, readonly string[]>;

/** The kinds of condition a feature may be in, whichever kind of feature it is. */
export type FeatureConditionType = typeof conditions[FeatureType][number];

/**
 * A condition assigned to a feature, annotatable with a belief about
 * its certainty. Which of the kinds a feature may be in depends on its
 * own kind, which `conditions` states.
 */
export type FeatureConditionAssignment = ObjectAssumption<ConditionState<FeatureConditionType>>;

/**
 * A hole (perforation) in the roll paper. Holes are the primary
 * carriers of musical information on piano rolls, as they trigger
 * notes and expression controls when passing over the tracker bar.
 * A punched hole is a human-made feature: CRM counts "the information
 * encoding features on mechanical or digital carriers" among the
 * features purposely created by human activity.
 * @see reo:Hole
 */
export interface Hole extends RollFeature<'Hole', typeof conditions.Hole[number]> {
    /**
     * The punching pattern of the hole. Regular holes have evenly-spaced
     * bridges, accelerating holes have decreasing bridge widths, and
     * staggering holes do not align in rows across the tracks, the mark
     * of an asynchronous perforator with a separate driver for each
     * punch (Phillips 2016, p. 112).
     * @see reo:pattern
     */
    pattern?: 'regular' | 'accelerating' | 'staggering';
}

/**
 * Something that lies on a face of the paper rather than through it. A
 * hole is not one: it goes through, and is on both faces at once.
 */
export interface OnAFace {
    /**
     * The face of the roll it lies on: the side that faces the reader
     * as the roll plays, or the back of it.
     * @see reo:side
     */
    side?: 'recto' | 'verso';
}

export const techniques = ['print', 'handwriting', 'stamp'] as const;

/** How a trace was put on the paper. */
export type Technique = typeof techniques[number];

export const media = ['ink', 'pencil', 'crayon'] as const;

/** What a trace was put on with. */
export type Medium = typeof media[number];

/**
 * A trace is a visible mark or writing on the roll surface.
 * Traces may fade over time.
 */
export interface Trace<T extends FeatureType> extends RollFeature<T, typeof conditions[T][number]>, OnAFace {
    /**
     * How the trace was put on the paper.
     * @see reo:technique
     */
    technique?: Technique;

    /**
     * What it was put on with, where it can be told. A date may be
     * known to be handwritten where the pencil cannot be told from
     * the ink, and a stamp leaves its ink as much as a pen does,
     * which is why the two are stated apart.
     * @see reo:medium
     */
    medium?: Medium;
}

/** The text a writing carries. It names no carriers of its own, the writing being its carrier. */
export type Transcription = Omit<Text, 'carriers'>

/**
 * A piece of writing found on the roll, such as a label,
 * catalogue number, or annotation. Writings state how they were made
 * and a transcription of their content.
 * @see reo:Writing
 */
export interface Writing extends Trace<'Writing'> {
    /**
     * A writing always states how it was put on the paper, which can
     * be read off it where the medium cannot.
     * @see reo:technique
     */
    technique: Technique;

    /**
     * A transcription of the text content of the writing.
     * This is an object assumption so that the transcription
     * can be annotated with a belief about its correctness.
     * @see crm:P128 carries
     */
    transcription: ObjectAssumption<Transcription>;

    /**
     * How far the writing stands askew. At zero it reads across the
     * roll, from the bass side towards the treble, and the angle turns
     * that reading direction towards the end of the roll, so that a
     * right angle leaves it reading along the roll. A stamp pressed
     * crooked and a label written lengthwise are both stated here.
     * @see reo:rotation
     */
    rotation?: Measure<'deg'>;
}

/**
 * A visible mark on the roll, such as a pencil circle, an ink stroke,
 * or other non-textual annotation. What a mark was meant to say is a
 * reading of it (crminf:I16 Meaning Comprehension) rather than a
 * property of the feature, so its shape is not stated here.
 * @see reo:Mark
 */
export interface Mark extends Trace<'Mark'> { }

/**
 * A piece of material (paper or tape) glued onto the roll surface.
 * Glued-on features are typically used to cover perforations (for corrections)
 * or to reinforce damaged areas. They may themselves carry other features
 * such as writings or additional holes.
 * @see reo:GluedOn
 */
export interface GluedOn extends RollFeature<'GluedOn', typeof conditions.GluedOn[number]>, OnAFace {
    /**
     * The material of the glued-on feature.
     * @see crm:P45 consists of
     */
    material: 'paper' | 'tape';

    /**
     * How far the patch was stuck on askew. At zero its edges stand
     * square to the roll, and the angle turns them towards the end of
     * it, as a writing's reading direction turns.
     * @see reo:rotation
     */
    rotation?: Measure<'deg'>;

    /**
     * A glued-on feature itself may carry other features.
     * Nested features do not need to be positioned explicitly.
     * @see crm:P46 is composed of
     */
    features?: NestedFeature[];
}

/**
 * The features proper: a hole, a writing and a mark are all human-made
 * features, and each of them is borne by whatever it sits on. A patch
 * is an object glued onto the paper and stands apart from them.
 */
export type AnyFeature = Hole | Writing | Mark;

/**
 * Anything found at a place of its own on the roll: a feature or a
 * glued-on patch. E24 Physical Human-Made Thing is the class both fall
 * under, E22 and E25 being its subclasses.
 */
export type FeatureOrPatch = AnyFeature | GluedOn;

/**
 * A feature without the place it would state of its own. The union is
 * distributed over, so that each kind of feature keeps its own keys.
 */
type Unplaced<T> = T extends FeatureOrPatch ? PartialBy<T, 'horizontal' | 'vertical'> : never;

/**
 * A feature borne by another feature. It states no place of its own,
 * the feature bearing it standing in one.
 */
export type NestedFeature = Unplaced<FeatureOrPatch>;

export const isRollFeature = (obj: object): obj is FeatureOrPatch => {
    return 'type' in obj && isFeatureType(obj.type);
}

export const isGluedOn = <T extends NestedFeature>(feature: T): feature is T & GluedOn =>
    feature.type === 'GluedOn';

/** The features a feature bears: a patch those stated as parts of it, any other feature none. */
export const featuresBorneBy = (feature: NestedFeature): NestedFeature[] =>
    isGluedOn(feature) ? feature.features ?? [] : [];

/** The feature together with everything it bears, as deep as a patch on a patch goes. */
export const withBorneFeatures = (feature: NestedFeature): NestedFeature[] =>
    [feature, ...featuresBorneBy(feature).flatMap(withBorneFeatures)];
