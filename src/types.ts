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

/**x
 * Expression Type
 */
export interface Expression extends RollEvent<'expression'> {
    hasScope: 'bass' | 'treble',
    P2HasType:
    'SustainPedalOn' | 'SustainPedalOff' |
    'MezzoforteOff' | 'MezzoforteOn' |
    'SlowCrescendoOn' | 'SlowCrescendoOff' |
    'ForzandoOn' | 'ForzandoOff'
}

/**
 * MeasurementEvent Type
 */
export interface MeasurementEvent extends WithId {
    hasCreated: (Expression | Note)[];
    measured: PhysicalRollCopy;
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
    wasCollatedFrom: (Note | Expression)[]
    isNonMusical?: boolean;
}

/**
 * Collation Type
 */
export interface Collation extends WithId {
    collated: string[]; // roll copies?
}

interface EditorialAction<T> extends WithId {
    type: T
    carriedOutBy: string
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
