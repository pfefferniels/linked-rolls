import {
    clamp,
    geometryInMm,
    Grid,
    levelChanges,
    mezzoforteTravel,
    paperSeconds,
    ROWS_PER_MM,
    travelBetweenRails,
    Half,
    Model,
    ModelInput,
    Parameters,
    PedalInput,
    PedalMode,
    PedalTravel,
    PortGeometry,
    Spool,
} from "welte-mignon-emulator";
import { Expression, Note } from "../Symbol.js";
import {
    DynamicsCurve,
    NegotiatedEvent,
    PedalCurve,
    Performance,
    PerformedNoteOffEvent,
    PerformedNoteOnEvent,
    PerformedPedalEvent,
    RollProperties
} from "../ReproducingSystem.js";
import { inCentimeters, Millimeters, mm, Seconds, seconds, Track } from "../Quantity.js";
import { partitionPoint } from "../sorted.js";
import { velocityOf, type VelocityMap } from "./velocity.js";

/**
 * What the Welte systems share downstream of the relay. Hagmann has the
 * nuancing unit built the same for both tracker scales (p. 96) and the valves
 * and bellows that move the pedals the same in both (p. 106), so the way a
 * performance is read off the emulator is one; what differs is in front of it,
 * and each system says that in the `Mechanism` it hands to `performWelte`.
 */

/** The options every Welte system takes. */
export type WelteOptions = {
    /**
     * The take-up spool, which sets the time axis: it is held at a constant
     * rate of revolution, so the paper runs faster as the spool fills.
     */
    spool: Spool

    /** Constants of the nuancing mechanism, one set for each half of the keyboard. */
    nuance: Record<Half, Parameters>

    /** Constants of the two pedal actions, one of `pedalPresets` or a set of one's own. */
    pedals: Parameters

    velocity: VelocityMap

    /**
     * How the pedals go out: as a continuous controller carrying the travel
     * of the bellows, or thresholded to the two values a switching renderer
     * understands.
     */
    pedalMode: PedalMode

    /** Diameter of the tracker-bar bore. */
    trackerBore: Millimeters

    /** Punch diameter for an edition whose copies record none. */
    punchDiameter: Millimeters

    /**
     * The track at which the keyboard is divided, so that notes from here
     * upwards follow the treble expression and the ones below it the bass.
     * Which side an expression perforation itself belongs to is not decided
     * here but read off the tracker bar.
     */
    division: Track
}

/** Whether two sets of constants are the same, value for value. */
export const sameParameters = (a: Parameters, b: Parameters): boolean =>
    Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([name, value]) => b[name] === value)

/** Paper the grid runs on past the last hole, so that a final pedal release completes. */
const RUN_OUT = mm(100)

const isNote = (event: NegotiatedEvent): event is NegotiatedEvent & Note => event.type === 'note'
const isExpression = (event: NegotiatedEvent): event is NegotiatedEvent & Expression => event.type === 'expression'

/**
 * Between the edition's shared place axis and this version's own paper.
 * `toOwnPaper` is 1 for a version on the axis it was measured on, and about
 * 0.775 for a green version whose places are in the red axis; see
 * `RollProperties`.
 *
 * Rows are rows of the version's own paper, so the spool is asked in
 * `paperOfRow` and never in `placeOfRow`: one is the paper that passes the
 * tracker bar, the other is the coordinate the edition states.
 */
export type Paper = {
    readonly rowOf: (place: Millimeters) => number
    readonly placeOfRow: (row: number) => Millimeters
    readonly paperOfRow: (row: number) => Millimeters
}

const paperOf = (toOwnPaper: number): Paper => ({
    rowOf: place => place * toOwnPaper * ROWS_PER_MM,
    placeOfRow: row => mm(row / (toOwnPaper * ROWS_PER_MM)),
    paperOfRow: row => mm(row / ROWS_PER_MM)
})

/** When the spool brings a place on the roll to the tracker bar. */
export const secondsAt = (spool: Spool, place: Millimeters): Seconds =>
    seconds(paperSeconds(spool, inCentimeters(place)))

const halfOf = (note: NegotiatedEvent, division: Track): Half =>
    note.vertical.from >= division ? 'treble' : 'bass'

/** A perforation as the emulator reads it: the control it operates and the rows it spans. */
export type WeltePunch = {
    readonly half: Half
    readonly control: string
    readonly rowOn: number
    readonly rowOff: number
}

/** A perforation as the tracker bar meets it, kept with the symbol it carries. */
type Reading<P extends WeltePunch> = {
    readonly event: NegotiatedEvent & Expression
    readonly punch: P
}

export type Ports = ModelInput['ports']

/**
 * What a Welte system puts in front of the shared nuancing unit and pedals:
 * how it reads a perforation, how it opens the ports, which pneumatic model
 * drives the bellows, and which the pedals.
 */
export type Mechanism<P extends WeltePunch> = {
    /** The punch the expression is read as, or nothing for one the mechanism does not read. */
    readonly punchOf: (event: NegotiatedEvent & Expression, rows: { rowOn: number, rowOff: number }) => P | undefined
    readonly portsOf: (grid: Grid, punches: readonly P[], geometry: PortGeometry) => Ports
    readonly model: Model
    readonly runPedals: (input: PedalInput, params: Parameters) => PedalTravel
    /** The name of the instrument the curves say they came from. */
    readonly instrument: string
}

/**
 * One sample per row of the scan the constants were fitted on, from the
 * beginning of the roll to a little past the last hole. The rows are
 * equally spaced on the paper and not in time, which is what the
 * emulator expects.
 */
const gridOver = (events: readonly NegotiatedEvent[], spool: Spool, paper: Paper): Grid => {
    const last = mm(events.reduce((furthest, event) => Math.max(furthest, event.horizontal.to), 0))
    const length = Math.ceil(paper.rowOf(last) + RUN_OUT * ROWS_PER_MM) + 1
    const times = new Float64Array(length).map((_, row) => secondsAt(spool, paper.paperOfRow(row)))
    return new Grid(0, times)
}

type Samples = Pick<DynamicsCurve, 'place' | 'seconds'>

const nuanceCurves = (
    grid: Grid,
    ports: Ports,
    samples: Samples,
    options: WelteOptions,
    model: Model,
    instrument: string
): Record<Half, DynamicsCurve> => {
    const curveOf = (half: Half): DynamicsCurve => {
        const params = options.nuance[half]
        const output = model.run({ grid, half, ports }, params)
        const travel = travelBetweenRails(output, params)
        const hook = clamp(mezzoforteTravel(params), 0.01, 0.99)
        return {
            ...samples,
            name: half,
            kind: 'dynamics',
            instrument,
            travel,
            velocity: travel.map(value => velocityOf(value, hook, options.velocity))
        }
    }

    return { bass: curveOf('bass'), treble: curveOf('treble') }
}

const performNotes = (
    events: readonly NegotiatedEvent[],
    grid: Grid,
    nuance: Record<Half, DynamicsCurve>,
    options: WelteOptions,
    paper: Paper
): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] =>
    events
        .filter(isNote)
        .flatMap((note): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] => {
            const curve = nuance[halfOf(note, options.division)]
            const velocity = curve.velocity[grid.indexOfRow(paper.rowOf(note.horizontal.from))]
            return [
                { type: 'noteOn', performs: note, pitch: note.pitch, velocity, at: secondsAt(options.spool, note.horizontal.from) },
                { type: 'noteOff', performs: note, pitch: note.pitch, velocity: 127, at: secondsAt(options.spool, note.horizontal.to) }
            ]
        })

/**
 * The travel of one pedal as controller steps. Each step is attributed to
 * the last perforation of that pedal the tracker bar has reached, which is
 * the one whose reading it follows from.
 */
const performPedal = <P extends WeltePunch>(
    type: PerformedPedalEvent['type'],
    curve: PedalCurve,
    grid: Grid,
    readings: readonly Reading<P>[],
    mode: PedalMode
): PerformedPedalEvent[] => {
    if (readings.length === 0) return []

    const ordered = readings.toSorted((a, b) => a.punch.rowOn - b.punch.rowOn)
    const causeOf = (row: number): NegotiatedEvent =>
        ordered[Math.max(partitionPoint(ordered, reading => reading.punch.rowOn <= row) - 1, 0)].event

    return levelChanges(curve.travel, { mode })
        .filter(change => change.index > 0)
        .map(change => ({
            type,
            performs: causeOf(grid.rowAt(change.index)),
            value: change.value,
            at: seconds(curve.seconds[change.index])
        }))
}

/** A performance, with the grid and ports it was read off, for a system that has more to ask of them. */
export type WeltePerformance = Performance & {
    readonly grid: Grid
    readonly ports: Ports
}

/**
 * Plays the events on a Welte mechanism: notes at the velocity of their half's
 * bellows, and the two pedals as the travel of theirs.
 *
 * The edition's tempo adjustment is left aside: it is stated as a paper
 * speed, and what the spool holds constant is its rate of revolution, so
 * the two are not the same quantity. The spool in the options sets the speed.
 */
export const performWelte = <P extends WeltePunch>(
    events: readonly NegotiatedEvent[],
    options: WelteOptions,
    roll: RollProperties,
    mechanism: Mechanism<P>
): WeltePerformance => {
    const paper = paperOf(roll.toOwnPaper ?? 1)
    const readings = events
        .filter(isExpression)
        .flatMap((event): Reading<P>[] => {
            const punch = mechanism.punchOf(event, {
                rowOn: paper.rowOf(event.horizontal.from),
                rowOff: paper.rowOf(event.horizontal.to)
            })
            return punch ? [{ event, punch }] : []
        })
    const grid = gridOver(events, options.spool, paper)
    const geometry = geometryInMm(roll.punchDiameter ?? options.punchDiameter, options.trackerBore)
    const ports = mechanism.portsOf(grid, readings.map(reading => reading.punch), geometry)
    const samples: Samples = {
        place: grid.seconds.map((_, row) => paper.placeOfRow(row)),
        seconds: grid.seconds
    }

    const nuance = nuanceCurves(grid, ports, samples, options, mechanism.model, mechanism.instrument)
    const travel = mechanism.runPedals({ grid, ports }, options.pedals)
    const damper: PedalCurve = { ...samples, name: 'damper', kind: 'pedal', travel: travel.damper }
    const hammerRail: PedalCurve = { ...samples, name: 'hammerRail', kind: 'pedal', travel: travel.hammerRail }
    const readingsOf = (control: string) => readings.filter(reading => reading.punch.control === control)

    return {
        grid,
        ports,
        events: [
            ...performNotes(events, grid, nuance, options, paper),
            ...performPedal('damper', damper, grid, readingsOf('sustainPedal'), options.pedalMode),
            ...performPedal('hammerRail', hammerRail, grid, readingsOf('hammerRail'), options.pedalMode)
        ],
        curves: [nuance.bass, nuance.treble, damper, hammerRail]
    }
}
