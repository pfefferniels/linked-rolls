interface WithId {
    'id': string
}

/**
 * EventSpan Type
 */
export interface EventSpan extends WithId {
    from: number;
    to: number;
    hasUnit: 'mm'
}

export interface RollEvent<T> extends WithId {
    type: T

    /**
     * Every roll event can be optionally 
     * assigned to a responsible hand
     */
    hand?: string

    /**
     * That assignement can have a certainty
     */
    cert?: Certainty

    /**
     * IIIF region in string form.
     */
    annotates?: string
    hasDimension: EventSpan
    trackerHole: number
}

/**
 * Note Type
 */
export interface Note extends RollEvent<'note'> {
    hasPitch: number;
}

export type ExpressionScope = 'bass' | 'treble';

export type ExpressionType =
    'SustainPedalOn' | 'SustainPedalOff' |
    'MezzoforteOff' | 'MezzoforteOn' |
    'SlowCrescendoOn' | 'SlowCrescendoOff' |
    'ForzandoOn' | 'ForzandoOff'

/**x
 * Expression Type
 */
export interface Expression extends RollEvent<'expression'> {
    hasScope: ExpressionScope
    P2HasType: ExpressionType
}

/**
 * This denotes perforations that are covered by an editor.
 * It has no properties since the position on the roll is 
 * given be the RollEvent interface already. The covered 
 * perforation is not considered to be part of the original
 * note or expression hole anymore.
 */
export interface Cover extends RollEvent<'cover'> {
}

/**
 * For handwritten insertions like e. g. the
 * perforation date in the end of a roll.
 */
export interface HandwrittenText extends RollEvent<'handwrittenText'> {
    text: string
}

/**
 * This type can be used to indicate stamps like "Controlliert" and others. 
 */
export interface Stamp extends RollEvent<'stamp'> {
    text: string
}

export type AnyRollEvent = Note | Expression | HandwrittenText | Stamp | Cover

/**
 * MeasurementEvent Type
 */
export interface MeasurementEvent extends WithId {
    hasCreated: AnyRollEvent[];
    measured: PhysicalRollCopy;
    usedSoftware: string
    hasTimeSpan: TimeSpan
}

/**
 * PhysicalRollCopy Type
 */
export interface PhysicalRollCopy extends WithId {
    hasType: string;
    catalogueNumber: string
    rollDate: string
}

/**
 * This type is modelled on E11 Modification
 */
export interface ManualEditing extends WithId {
    hasModified: PhysicalRollCopy
    carriedOutBy: string
    hasTimeSpan: TimeSpan
}

/**
 * TimeSpan Type
 */
export interface TimeSpan extends WithId {
    atSomeTimeWithin: string;
}

/**
 * ConditionState Type
 */
export interface ConditionState extends WithId {
    hasNote: string;
    hasTimeSpan: TimeSpan;
    isConditionOf: PhysicalRollCopy;
}

/**
 * ConditionAssessment Type
 */
export interface ConditionAssessment extends WithId {
    carriedOutBy: string
    hasTimeSpan: TimeSpan
    hasIndentified: ConditionState;
}

/**
 * CollatedEvent Type
 */
export interface CollatedEvent extends WithId {
    wasCollatedFrom: AnyRollEvent[]
}

export const isCollatedEvent = (e: any) => {
    return 'wasCollatedFrom' in e
}

/**
 * Collation Type
 */
export interface Collation extends WithId {
    collated: string[]; // roll copies?
}

export type Certainty = 'high' | 'medium' | 'low' | 'unknown'

interface EditorialAction<T> extends WithId {
    type: T
    carriedOutBy: string
    certainty?: Certainty
    note?: string
}

/**
 * Unification corrects an error in the perforation of
 * a roll copy where one event unintentionally was split in two.
 */
export interface Unification extends EditorialAction<'unification'> {
    unified: CollatedEvent[]
}

/**
 * Unification corrects an error in the perforation of
 * a roll copy where two events unintentionally became one.
 */
export interface Separation extends EditorialAction<'separation'> {
    separated: CollatedEvent
    into: CollatedEvent[]
}

export interface Lemma extends EditorialAction<'lemma'> {
    preferred: CollatedEvent[]
    over: CollatedEvent[]
}

export interface RelativePlacement extends EditorialAction<'relativePlacement'> {
    placed: CollatedEvent
    relativeTo: CollatedEvent[]
    withPlacementType: 'startsBeforeTheStartOf' | 'startsBeforeTheEndOf'
}

export interface Annotation extends EditorialAction<'annotation'> {
    annotated: CollatedEvent[]
    with: string
}

export interface TempoAdjustment extends EditorialAction<'tempoAdjustment'> {
    adjusts: string;
    startsWith: number;
    endsWith: number;
}

export type Assumption = Unification | Separation | Lemma | RelativePlacement | Annotation | TempoAdjustment

export interface Operation<T> extends WithId {
    type: T
}
/**
 * Stretching Type
 */
export interface Stretching extends Operation<'stretching'> {
    factor: number;
}

/**
 * Shifting Type
 */
export interface Shifting extends Operation<'shifting'> {
    vertical: number;
    horizontal: number;
}
