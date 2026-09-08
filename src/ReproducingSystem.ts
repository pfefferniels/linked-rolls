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
     * Position on the printed ordinate of the roll's own ruled band: 0 at that
     * half's P.P. gridline, 1 at the shared F.F. line, with M.F. at 0.5. For a
     * pedal, 0 with it up and 1 with it down.
     *
     * Both Welte scales rule that band the same way — five rails, "P.P. M.F.
     * F.F. M.F. P.P.", three named levels a side with the centre F.F. shared,
     * measuring 20.0 mm between rails on red 3309 and on green Welte 184 alike —
     * so a curve from one system and a curve from the other are in one unit, on
     * Welte's authority rather than on ours. That is what lets a red issue and a
     * green issue of one recording be compared at all. It is a unit of *drawn
     * deflection*: whether the deflection is linear in the bellows' own travel is
     * open, and is what the emulator's `scaleWarp` exists to answer.
     */
    readonly travel: Float64Array
}

/** The dynamics of one part of the keyboard, with the velocity the travel maps onto. */
export type DynamicsCurve = CurveSamples & {
    readonly kind: 'dynamics'
    readonly velocity: Float64Array

    /**
     * The instrument whose constants produced it, by name. A comparison plot
     * must not be able to put two curves side by side without saying which
     * instrument each came from: a T-98 fitted to a green roll's drawn line and
     * a T-98 fitted to a red copy's curve answer different questions, and their
     * difference is the point of the comparison.
     */
    readonly instrument: string
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
