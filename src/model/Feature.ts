import { ObjectAssumption } from "./Assumption.js";
import { ConditionState } from "./ConditionState.js";
import { Text } from "./Symbol.js";
import { PartialBy, WithId, WithType } from "../shared/utils.js";
import { Measure, Millimeters, Track } from "./Quantity.js";

/**
 * Describes the horizontal extent of a feature on the roll,
 * measured in millimeters from the beginning of the roll.
 * The `from` value is the start position and `to` is the end position.
 * @see crm:E54 Dimension
 * @category Model
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
 * @category Model
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

/**
 * The kinds of feature, a patch among them, each by the type that names
 * it.
 * @category Vocabulary
 */
export const featureTypes = ['HoleChain', 'Writing', 'Mark', 'Patch'] as const;

/**
 * The type naming a kind of feature.
 * @category Model
 */
export type FeatureType = typeof featureTypes[number];

/**
 * Whether the value names a kind of feature.
 * @category Model
 */
export const isFeatureType = (value: unknown): value is FeatureType =>
    featureTypes.includes(value as FeatureType);

/**
 * A feature on the roll, e.g. a perforation, a writing, a mark or a
 * patch, defined by its horizontal and vertical position and
 * extent. Each kind of feature is a class of its own, which its type
 * names.
 * @category Model
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

/**
 * The kinds of condition each kind of feature may be in.
 * @category Vocabulary
 */
export const conditions = {
    HoleChain: ['partially-torn', 'missing-perforation'],
    Writing: ['illegible'],
    Mark: ['faded'],
    Patch: ['detaching', 'ripped']
} as const satisfies Record<FeatureType, readonly string[]>;

/**
 * The kinds of condition a feature may be in, whichever kind of feature it is.
 * @category Model
 */
export type FeatureConditionType = typeof conditions[FeatureType][number];

/**
 * A condition assigned to a feature, annotatable with a belief about
 * its certainty. Which of the kinds a feature may be in depends on its
 * own kind, which `conditions` states.
 * @category Model
 */
export type FeatureConditionAssignment = ObjectAssumption<ConditionState<FeatureConditionType>>;

/**
 * A chain of holes punched along the roll, which the tracker bar reads
 * as it passes. The perforator cuts a held note or function as a row of
 * punches with bridges of paper left between them, so most perforations
 * are chains; one without a bridge is a chain of a single hole. The
 * holes are the chain's parts and are not stated one by one. A punched
 * chain is a human-made feature: CRM counts "the information encoding
 * features on mechanical or digital carriers" among the features
 * purposely created by human activity.
 * @see reo:HoleChain
 * @category Model
 */
export interface HoleChain extends RollFeature<'HoleChain', typeof conditions.HoleChain[number]> {}

/**
 * Something that lies on a face of the paper rather than through it. A
 * chain of holes is not one: it goes through, and is on both faces at once.
 * @category Model
 */
export interface OnAFace {
    /**
     * The face of the roll it lies on: the side that faces the reader
     * as the roll plays, or the back of it.
     * @see reo:side
     */
    side?: 'recto' | 'verso';
}

/**
 * The ways a trace may have been put on the paper.
 * @category Vocabulary
 */
export const techniques = ['print', 'handwriting', 'stamp'] as const;

/**
 * How a trace was put on the paper.
 * @category Model
 */
export type Technique = typeof techniques[number];

/**
 * What a trace may have been put on the paper with.
 * @category Vocabulary
 */
export const media = ['ink', 'pencil', 'crayon'] as const;

/**
 * What a trace was put on with.
 * @category Model
 */
export type Medium = typeof media[number];

/**
 * A trace is a visible mark or writing on the roll surface.
 * Traces may fade over time.
 * @category Model
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

/**
 * The text a writing carries. It names no carriers of its own, the writing being its carrier.
 * @category Model
 */
export type Transcription = Omit<Text, 'carriers'>

/**
 * A piece of writing found on the roll, such as a label,
 * catalogue number, or annotation. Writings state how they were made
 * and a transcription of their content.
 * @see reo:Writing
 * @category Model
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
 * @category Model
 */
export interface Mark extends Trace<'Mark'> { }

/**
 * A piece of paper or tape glued onto the roll: a label naming it, a
 * strip covering perforations, or a patch reinforcing a tear. A patch
 * may itself carry other features, such as writings or holes.
 * @see reo:Patch
 * @category Model
 */
export interface Patch extends RollFeature<'Patch', typeof conditions.Patch[number]>, OnAFace {
    /**
     * What the patch is made of.
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
     * The features the patch itself carries. They need not be
     * positioned explicitly.
     * @see crm:P46 is composed of
     */
    features?: NestedFeature[];
}

/**
 * The features proper: a chain of holes, a writing and a mark are all
 * human-made features, and each of them is borne by whatever it sits on.
 * A patch is an object glued onto the paper and stands apart from them.
 * @category Model
 */
export type AnyFeature = HoleChain | Writing | Mark;

/**
 * Anything found at a place of its own on the roll: a feature or a
 * patch. E24 Physical Human-Made Thing is the class both fall under,
 * E22 and E25 being its subclasses.
 * @category Model
 */
export type FeatureOrPatch = AnyFeature | Patch;

/**
 * A feature without the place it would state of its own. The union is
 * distributed over, so that each kind of feature keeps its own keys.
 */
type Unplaced<T> = T extends FeatureOrPatch ? PartialBy<T, 'horizontal' | 'vertical'> : never;

/**
 * A feature borne by another feature. It states no place of its own,
 * the feature bearing it standing in one.
 * @category Model
 */
export type NestedFeature = Unplaced<FeatureOrPatch>;

/**
 * Whether the feature states a place of its own, which one a patch bears does not.
 * @category Model
 */
export const isPlaced = (feature: NestedFeature): feature is FeatureOrPatch =>
    feature.horizontal !== undefined && feature.vertical !== undefined;

/**
 * Whether the object is a feature or a patch, as its type says.
 * @category Model
 */
export const isRollFeature = (obj: object): obj is FeatureOrPatch => {
    return 'type' in obj && isFeatureType(obj.type);
}

/**
 * Whether the feature is a patch.
 * @category Model
 */
export const isPatch = <T extends NestedFeature>(feature: T): feature is T & Patch =>
    feature.type === 'Patch';

/**
 * The features a feature bears: a patch those stated as parts of it, any other feature none.
 * @category Model
 */
export const featuresBorneBy = (feature: NestedFeature): NestedFeature[] =>
    isPatch(feature) ? feature.features ?? [] : [];

/**
 * The feature together with everything it bears, as deep as a patch on a patch goes.
 * @category Model
 */
export const withBorneFeatures = (feature: NestedFeature): NestedFeature[] =>
    [feature, ...featuresBorneBy(feature).flatMap(withBorneFeatures)];
