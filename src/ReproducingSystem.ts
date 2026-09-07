import { Hole } from "./Feature";
import { Expression, Note } from "./Symbol";
import { TrackerBar } from "./TrackerBar";
import { Millimeters, Quantity, Seconds } from "./Quantity";

export type SpeedUnit = 'ft/min' | 'm/min'

/**
 * The playback tempo of the roll as a paper speed, stated at the
 * beginning and at the end, since the speed may change over the
 * course of the roll through acceleration.
 * @see crm:E54 Dimension
 */
export interface RollTempoIn<U extends SpeedUnit> {
    /**
     * The tempo at the beginning of the roll.
     * @see reo:from
     */
    startsWith: Quantity<U>;
    /**
     * The tempo at the end of the roll.
     * @see reo:to
     */
    endsWith: Quantity<U>;
    /**
     * The unit of the tempo measurement.
     * @see crm:P91 has unit
     */
    unit: U;
}

export type RollTempo = RollTempoIn<'ft/min'> | RollTempoIn<'m/min'>

/**
 * A note or expression of a version with the dimensions of its carriers
 * averaged in and the editorial assumptions applied, which is all a
 * performance needs to know of a symbol.
 */
export type NegotiatedEvent =
    Omit<Note | Expression, 'carriers'>
    & Pick<Hole, 'horizontal' | 'vertical'>

interface PerformedRollFeature<T> {
    type: T
    performs: NegotiatedEvent
    /** Time from the beginning of the roll. */
    at: Seconds
}

interface PerformedNoteEvent<T> extends PerformedRollFeature<T> {
    pitch: number;
    velocity: number;
}

export interface PerformedNoteOnEvent extends PerformedNoteEvent<'noteOn'> { }
export interface PerformedNoteOffEvent extends PerformedNoteEvent<'noteOff'> { }

/**
 * One step of a pedal. A pedal driven by a bellows takes time to travel,
 * so a single perforation results in a run of these; `performs` is the
 * perforation whose reading the step follows from.
 */
export interface PerformedPedalEvent extends PerformedRollFeature<'damper' | 'hammerRail'> {
    /** 0 with the pedal up and 127 with it fully down. */
    value: number
}

export type AnyPerformedRollFeature =
    PerformedNoteOnEvent |
    PerformedNoteOffEvent |
    PerformedPedalEvent

interface CurveSamples {
    readonly name: string

    /** Paper position of each sample, in mm from the beginning of the roll. */
    readonly place: Float64Array

    readonly seconds: Float64Array

    /**
     * Position between the two ends of a travel: 0 with a bellows open and
     * 1 with it closed, 0 with a pedal up and 1 with it down.
     */
    readonly travel: Float64Array
}

/** The dynamics of one part of the keyboard, with the velocity the travel maps onto. */
export type DynamicsCurve = CurveSamples & {
    readonly kind: 'dynamics'
    readonly velocity: Float64Array
}

export type PedalCurve = CurveSamples & {
    readonly kind: 'pedal'
}

export type EmulatedCurve = DynamicsCurve | PedalCurve

/** What the edition records about the roll that a mechanism may want to know. */
export type RollProperties = {
    /** Diameter of the punches, where the copies record it. */
    punchDiameter?: Millimeters

    /** The tempo the edition adjusts the roll to, where it states one. */
    tempo?: RollTempo
}

export type Performance = {
    readonly events: readonly AnyPerformedRollFeature[]
    readonly curves: readonly EmulatedCurve[]
}

/**
 * A reproducing piano as the edition sees it, from two sides: the tracker
 * bar reads the holes into symbols, and the mechanism plays the symbols.
 * Implementations live outside the core of this library, so that it does
 * not depend on any one instrument's model; `linked-rolls/welte-t100` is
 * the first.
 */
export interface ReproducingSystem<Options extends object> {
    readonly name: string
    readonly trackerBar: TrackerBar
    readonly defaultOptions: Options

    /** Performs the events of a version, given in order of place. */
    perform(events: readonly NegotiatedEvent[], options: Options, roll: RollProperties): Performance
}
