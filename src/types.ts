export interface WithId {
    'id': string
}

export interface EventSpan {
    from: number;
    to?: number;
    hasUnit: 'mm' | 'track'
}

export interface EventDimension extends WithId {
    horizontal: EventSpan
    vertical: EventSpan
}

export interface RollEvent<T> extends WithId {
    type: T

    /**
     * IIIF region in string form.
     */
    annotates?: string

    hasDimension: EventDimension
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

export interface MeasurementInfo {
    dpi: number
    druid: string
    iiifLink: string // should link to info.json file
    holeSeparation: number
    margins: { bass: number, treble: number }
    rollWidth: number
    averagePunchDiameter: number
}

/**
 * MeasurementEvent Type
 */
export interface MeasurementEvent extends WithId {
    hasCreated: {
        info: MeasurementInfo,
        events: AnyRollEvent[]
    };
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
    carriedOutBy: string
    hasTimeSpan: TimeSpan
    note?: string
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
    hasIdentified: ConditionState;
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

export const isRollEvent = (e: any) => {
    return 'hasDimension' in e
}

/**
 * Collation Type
 */
// export interface Collation extends WithId {
//     collated: string[]; // roll copies?
// }


