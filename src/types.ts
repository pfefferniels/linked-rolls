import { AnyRollEvent } from "./RollEvent";

export interface WithId {
    'id': string
}

export interface PreliminaryRoll extends WithId {}

export interface SoftwareExecution {
    software: string
    date: string
}

export interface MeasurementEvent extends WithId {
    dimensions?: {
        width: number, 
        height: number, 
        unit: string
    }

    punchDiameter?: {
        value: number 
        unit: string
    }

    holeSeparation?: {
        value: number 
        unit: string
    }

    margins?: {
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

export const isCollatedEvent = (e: any): e is CollatedEvent => {
    return 'wasCollatedFrom' in e
}

export const isRollEvent = (e: any): e is AnyRollEvent => {
    return 'hasDimension' in e
}
