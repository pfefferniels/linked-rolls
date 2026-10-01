import { HoleChain } from "../model/Feature.js";
import { Expression, Note } from "../model/Symbol.js";
import { TrackerBar } from "./TrackerBar.js";
import { MetersPerMinute, Millimeters, Seconds } from "../model/Quantity.js";

/**
 * A note or expression of a version with the dimensions of its carriers
 * averaged in and the editorial assumptions applied, which is all a
 * performance needs to know of a symbol.
 */
export type NegotiatedEvent =
    Omit<Note | Expression, 'carriers'>
    & Pick<HoleChain, 'horizontal' | 'vertical'>

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
 * so a single command results in a run of these; `performs` is the
 * command whose reading the step follows from.
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

    /**
     * The speed the version's paper starts at, where the copies that bear
     * witness to it state the speed they were cut for (`paperSpeedOf`), or
     * failing them those of the version it derives from on the same
     * system, whose paper it keeps. A stated speed is the speed at the
     * beginning of the roll, as a tempo marking gives it, and the spool
     * accelerates from there.
     */
    paperSpeed?: MetersPerMinute

    /**
     * Where the version is a re-cut for another system: how long its paper
     * runs for a length of the paper of the version it derives from, and
     * the speed stated for that version, if any. A system with no spool of
     * its own times such a version by these, so that it sounds at the
     * tempo of the roll it was re-cut from.
     */
    recutFrom?: {
        readonly lengthRatio: number
        readonly paperSpeed?: MetersPerMinute
    }

    /**
     * Place on the edition's shared axis × this = millimetres of the version's
     * own paper, unstretched. About 0.775 for a green issue of a red
     * recording, and close to 1 for a version of the reference copy's own
     * system, which is the default.
     *
     * Versions of several systems share one place axis, so a green version's
     * places are in red millimetres and would play about 29 % long if the
     * spool read them as green paper. The factor is what the alignments of
     * all the copies give together for the paper of the version's system
     * (`paperOf`): red copies carry a green version's notes too, but only
     * the green copies' alignments say anything about green paper.
     *
     * It scales **places only**. Punch diameter, the chain gap and the tracker
     * bore are measured on the version's own paper already, and scaling them
     * as well would put the aperture model out by the factor with nothing
     * failing loudly.
     */
    toOwnPaper?: number
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
