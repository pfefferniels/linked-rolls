import {
    aperturePorts,
    DEFAULT_PUNCH_MM,
    geometryInMm,
    Grid,
    levelChanges,
    mezzoforteTravel,
    noteDensity,
    paperSeconds,
    pedalDefaults,
    playbackParameters,
    pneumaticModel,
    ROWS_PER_MM,
    runPedals,
    TRACKER_BORE_MM,
    travelBetweenRails,
    WELTE_SPOOL,
    Action,
    Control,
    Half,
    Parameters,
    PedalMode,
    Punch,
    Spool,
} from "welte-t100-emulator";
import { Expression, ExpressionScope, ExpressionType, Note } from "../Symbol";
import { welteT100 } from "../TrackerBar";
import { Hole } from "../Feature";
import {
    DynamicsCurve,
    NegotiatedEvent,
    PedalCurve,
    Performance,
    PerformedNoteOffEvent,
    PerformedNoteOnEvent,
    PerformedPedalEvent,
    ReproducingSystem,
    RollProperties
} from "../ReproducingSystem";

/**
 * MIDI velocity at the open rail of the Nuancierbalg, at the Mezzoforte pin,
 * and at the closed rail, joined linearly in between. Nothing in the
 * mechanism determines how bellows travel maps onto hammer velocity, so
 * these are anchors rather than measurements; the three values are the
 * ones midi2exp publishes.
 */
export type VelocityMap = {
    piano: number
    mezzoforte: number
    forte: number
}

export type WelteT100Options = {
    /**
     * The take-up spool, which sets the time axis: it is held at a constant
     * rate of revolution, so the paper runs faster as the spool fills.
     */
    spool: Spool

    /** Constants of the nuancing mechanism, one set for each half of the keyboard. */
    nuance: Record<Half, Parameters>

    /** Constants of the two pedal actions. */
    pedals: Parameters

    velocity: VelocityMap

    /**
     * How the pedals go out: as a continuous controller carrying the travel
     * of the bellows, or thresholded to the two values a switching renderer
     * understands.
     */
    pedalMode: PedalMode

    /** Diameter of the tracker-bar bore, in mm. */
    trackerBore: number

    /** Punch diameter in mm, for an edition whose copies record none. */
    punchDiameter: number

    /**
     * The track at which the keyboard is divided, so that notes from
     * here upwards follow the treble expression and the ones below it
     * the bass. Which side an expression perforation itself belongs to
     * is not decided here but read off the tracker bar.
     */
    division: number
}

export const defaultWelteT100Options: WelteT100Options = {
    spool: WELTE_SPOOL,
    nuance: {
        bass: playbackParameters('bass'),
        treble: playbackParameters('treble')
    },
    pedals: pedalDefaults,
    velocity: { piano: 35, mezzoforte: 60, forte: 90 },
    pedalMode: 'continuous',
    trackerBore: TRACKER_BORE_MM,
    punchDiameter: DEFAULT_PUNCH_MM,
    division: 54
}

/** What each expression code operates, in the emulator's terms. */
const CODES: ReadonlyMap<ExpressionType, readonly [Control, Action]> = new Map([
    ['MezzoforteOn', ['mezzoforte', 'on']],
    ['MezzoforteOff', ['mezzoforte', 'off']],
    ['SlowCrescendoOn', ['crescendo', 'on']],
    ['SlowCrescendoOff', ['crescendo', 'off']],
    ['ForzandoOn', ['sforzando', 'on']],
    ['ForzandoOff', ['sforzando', 'off']],
    ['SustainPedalOn', ['sustainPedal', 'on']],
    ['SustainPedalOff', ['sustainPedal', 'off']],
    ['SoftPedalOn', ['hammerRail', 'on']],
    ['SoftPedalOff', ['hammerRail', 'off']],
    ['MotorOn', ['windResistance', 'on']],
    ['MotorOff', ['windResistance', 'off']],
    ['Rewind', ['rewind', 'on']],
    ['ElectricCutOff', ['electricCutoff', 'on']]
])

/** Paper the grid runs on past the last hole, so that a final pedal release completes. */
const RUN_OUT_MM = 100

/**
 * Which stack of valves an expression perforation belongs to. The symbol
 * usually says so, having been read off the tracker bar already; where it
 * does not, the bar is asked again, since sending a perforation to neither
 * side would quietly flatten the dynamics.
 */
const scopeOf = (
    event: { scope?: ExpressionScope } & Pick<Hole, 'vertical'>
): ExpressionScope | undefined => {
    if (event.scope) return event.scope

    const meaning = welteT100.meaningOf(event.vertical.from)
    return meaning?.type === 'expression' ? meaning.scope : undefined
}

const isNote = (event: NegotiatedEvent): event is NegotiatedEvent & Note => event.type === 'note'
const isExpression = (event: NegotiatedEvent): event is NegotiatedEvent & Expression => event.type === 'expression'

const rowOf = (mm: number) => mm * ROWS_PER_MM

/** When the spool brings a place on the roll, in mm, to the tracker bar. */
export const secondsAt = (spool: Spool, mm: number): number => paperSeconds(spool, mm / 10)

const halfOf = (note: NegotiatedEvent, division: number): Half =>
    note.vertical.from >= division ? 'treble' : 'bass'

/** A perforation as the tracker bar meets it, kept with the symbol it carries. */
type Reading = {
    readonly event: NegotiatedEvent & Expression
    readonly punch: Punch
}

const readingOf = (event: NegotiatedEvent & Expression): Reading | undefined => {
    const code = CODES.get(event.expressionType)
    const half = scopeOf(event)
    if (!code || !half) return undefined

    const [control, action] = code
    return {
        event,
        punch: { half, control, action, rowOn: rowOf(event.horizontal.from), rowOff: rowOf(event.horizontal.to) }
    }
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * The velocity map joined linearly through its three anchors, with the
 * middle one at the Mezzoforte pin of the half in question.
 */
const velocityOf = (travel: number, hook: number, map: VelocityMap): number => {
    const position = clamp(travel, 0, 1)
    if (position <= hook) {
        return map.piano + (position / hook) * (map.mezzoforte - map.piano)
    }
    return map.mezzoforte + ((position - hook) / (1 - hook)) * (map.forte - map.mezzoforte)
}

/**
 * One sample per row of the scan the constants were fitted on, from the
 * beginning of the roll to a little past the last hole. The rows are
 * equally spaced on the paper and not in time, which is what the
 * emulator expects.
 */
const gridOver = (events: readonly NegotiatedEvent[], spool: Spool): Grid => {
    const lastMm = events.reduce((furthest, event) => Math.max(furthest, event.horizontal.to), 0)
    const length = Math.ceil(rowOf(lastMm + RUN_OUT_MM)) + 1
    const seconds = Float64Array.from({ length }, (_, row) => secondsAt(spool, row / ROWS_PER_MM))
    return new Grid(0, seconds)
}

type Ports = ReturnType<typeof aperturePorts>
type Samples = Pick<DynamicsCurve, 'place' | 'seconds'>

const nuanceCurves = (
    grid: Grid,
    ports: Ports,
    samples: Samples,
    events: readonly NegotiatedEvent[],
    options: WelteT100Options
): Record<Half, DynamicsCurve> => {
    const onsetRows = (half: Half) =>
        events
            .filter(isNote)
            .filter(note => halfOf(note, options.division) === half)
            .map(note => rowOf(note.horizontal.from))
    const density = {
        bass: noteDensity(grid, onsetRows('bass')),
        treble: noteDensity(grid, onsetRows('treble')),
    }
    const totalNoteDensity = Float64Array.from(density.bass, (value, index) => value + density.treble[index])

    const curveOf = (half: Half): DynamicsCurve => {
        const params = options.nuance[half]
        const output = pneumaticModel.run(
            { grid, half, ports, noteDensity: density[half], totalNoteDensity },
            params
        )
        const travel = travelBetweenRails(output, params)
        const hook = clamp(mezzoforteTravel(params), 0.01, 0.99)
        return {
            ...samples,
            name: half,
            kind: 'dynamics',
            travel,
            velocity: Float64Array.from(travel, value => velocityOf(value, hook, options.velocity))
        }
    }

    return { bass: curveOf('bass'), treble: curveOf('treble') }
}

const pedalCurves = (
    grid: Grid,
    ports: Ports,
    samples: Samples,
    options: WelteT100Options
): { damper: PedalCurve, hammerRail: PedalCurve } => {
    const travel = runPedals({ grid, ports }, options.pedals)
    return {
        damper: { ...samples, name: 'damper', kind: 'pedal', travel: travel.damper },
        hammerRail: { ...samples, name: 'hammerRail', kind: 'pedal', travel: travel.hammerRail }
    }
}

const performNotes = (
    events: readonly NegotiatedEvent[],
    grid: Grid,
    nuance: Record<Half, DynamicsCurve>,
    options: WelteT100Options
): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] =>
    events
        .filter(isNote)
        .flatMap((note): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] => {
            const curve = nuance[halfOf(note, options.division)]
            const velocity = curve.velocity[grid.indexOfRow(rowOf(note.horizontal.from))]
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
const performPedal = (
    type: PerformedPedalEvent['type'],
    curve: PedalCurve,
    grid: Grid,
    readings: readonly Reading[],
    mode: PedalMode
): PerformedPedalEvent[] => {
    if (readings.length === 0) return []

    const ordered = readings.toSorted((a, b) => a.punch.rowOn - b.punch.rowOn)
    const causeOf = (row: number): NegotiatedEvent =>
        ordered[Math.max(ordered.findLastIndex(reading => reading.punch.rowOn <= row), 0)].event

    return levelChanges(curve.travel, { mode })
        .filter(change => change.index > 0)
        .map(change => ({
            type,
            performs: causeOf(grid.rowAt(change.index)),
            value: change.value,
            at: curve.seconds[change.index]
        }))
}

/**
 * The edition's tempo adjustment is left aside: it is stated as a paper
 * speed, and what the spool holds constant is its rate of revolution, so
 * the two are not the same quantity. The spool in the options sets the speed.
 */
const perform = (
    events: readonly NegotiatedEvent[],
    options: WelteT100Options,
    roll: RollProperties
): Performance => {
    const readings = events
        .filter(isExpression)
        .map(readingOf)
        .filter((reading): reading is Reading => reading !== undefined)
    const grid = gridOver(events, options.spool)
    const geometry = geometryInMm(roll.punchDiameter ?? options.punchDiameter, options.trackerBore)
    const ports = aperturePorts(grid, readings.map(reading => reading.punch), geometry)
    const samples: Samples = {
        place: Float64Array.from(grid.seconds, (_, row) => row / ROWS_PER_MM),
        seconds: grid.seconds
    }

    const nuance = nuanceCurves(grid, ports, samples, events, options)
    const pedals = pedalCurves(grid, ports, samples, options)
    const readingsOf = (control: Control) => readings.filter(reading => reading.punch.control === control)

    return {
        events: [
            ...performNotes(events, grid, nuance, options),
            ...performPedal('damper', pedals.damper, grid, readingsOf('sustainPedal'), options.pedalMode),
            ...performPedal('hammerRail', pedals.hammerRail, grid, readingsOf('hammerRail'), options.pedalMode)
        ],
        curves: [nuance.bass, nuance.treble, pedals.damper, pedals.hammerRail]
    }
}

/**
 * The red Welte, as welte-t100-emulator models it: the take-up spool sets
 * the time axis, the Nuancierbälge fill through their conduits and are
 * arrested by the Mezzoforte pin, and the two pedals travel rather than
 * switch. The constants are those fitted against the hand-drawn nuance
 * lines of roll 3309, with the terms that describe the drawing apparatus
 * switched off.
 */
export const welteT100System: ReproducingSystem<WelteT100Options> = {
    name: 'Welte-Mignon T100',
    trackerBar: welteT100,
    defaultOptions: defaultWelteT100Options,
    perform
}
