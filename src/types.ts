export interface WithId {
    'id': string
}

export interface EventSpan {
    from: number;
    to?: number;
    hasUnit: 'mm' | 'track'
}

export interface EventDimension {
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
    'SoftPedalOn' | 'SoftPedalOff' |
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
    rotation?: number 
}

/**
 * This type can be used to indicate stamps like e. g. the
 * "controlliert" stamp in the beginning of rolls or the 
 * date at the end of (later) Welte rolls.
 */
export interface Stamp extends RollEvent<'stamp'> {
    text: string
    rotation?: number 
}

export interface RollLabel extends RollEvent<'rollLabel'> {
    text: string 
    signed: boolean
}

export type AnyRollEvent = Note | Expression | HandwrittenText | Stamp | Cover | RollLabel

export interface SoftwareExecution {
    software: string
    date: string
}

export interface MeasurementEvent extends WithId {
    dimensions: {
        width: number, 
        height: number, 
        unit: string
    }

    punchDiameter: {
        value: number 
        unit: string
    }

    holeSeparation: {
        value: number 
        unit: string
    }

    margins: {
        treble: number 
        bass: number 
        unit: string
    }

    events: AnyRollEvent[]
    executions: SoftwareExecution[]
}

/**
 * This type is modelled on E11 Modification
 */
export interface Hand extends WithId {
    carriedOutBy: string
    date: string
    note?: string
}

/**
 * Describes the physical condition of a roll 
 * in a certain time period or time point. It
 * also documents the responsible person who 
 * assessed the roll's condition.
 */
export interface ConditionState extends WithId {
    note: string;
    date: string;
    assessment: ConditionAssessment
}

export interface ConditionAssessment extends WithId {
    carriedOutBy: string
    date: string
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
