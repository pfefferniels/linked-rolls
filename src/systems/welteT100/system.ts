import {
    DEFAULT_PUNCH_MM,
    geometryInMm,
    Grid,
    levelChanges,
    paperSeconds,
    pedalBrushing,
    pedalDefaults,
    ROWS_PER_MM,
    TRACKER_BORE_MM,
    WELTE_SPOOL,
    Half,
    Parameters,
    PedalMode,
    Spool,
} from "welte-mignon-emulator";
import {
    aperturePorts,
    CONSENSUS,
    mezzoforteTravel,
    pneumaticModel,
    PRESETS,
    runPedals,
    travelBetweenRails,
    Action,
    Control,
    Instrument,
    Punch,
    RollNumber,
} from "welte-mignon-emulator/t100";
import { Expression, Note } from "../../Symbol";
import { welteT100, WelteT100ExpressionType } from "./bar";
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
} from "../../ReproducingSystem";
import { add, inCentimeters, Millimeters, mm, Seconds, seconds, Track, track } from "../../Quantity";
import { partitionPoint } from "../../sorted";
import { defaultVelocityMap, velocityOf, type VelocityMap } from "../velocity";

export type { VelocityMap } from "../velocity";

export type { Instrument } from "welte-mignon-emulator/t100";

export type InstrumentName = 'consensus' | RollNumber

/**
 * The instruments the emulator was fitted as: the consensus over the six
 * rolls with drawn nuance lines, and the setting that drew each of them,
 * named by the roll's Welte number. The provenance beside each says what
 * it was fitted to and how well.
 */
export const instruments: Readonly<Record<InstrumentName, Instrument>> = { consensus: CONSENSUS, ...PRESETS }

/** The instruments by name, the consensus first. */
export const instrumentNames: readonly InstrumentName[] = ['consensus', ...Object.keys(PRESETS) as RollNumber[]]

const sameParameters = (a: Parameters, b: Parameters): boolean =>
    Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([name, value]) => b[name] === value)

/** The nuancing constants of an instrument, one set for each half of the keyboard. */
export const nuanceOf = (instrument: Instrument): Record<Half, Parameters> =>
    ({ bass: instrument.bass, treble: instrument.treble })

/** The instrument a pair of nuancing constants belongs to, if it is one. */
export const instrumentNameOf = (nuance: Record<Half, Parameters>): InstrumentName | undefined =>
    instrumentNames.find(name =>
        sameParameters(instruments[name].bass, nuance.bass) && sameParameters(instruments[name].treble, nuance.treble))

/**
 * The two readings of the pedal mechanism the emulator offers, by name.
 * Under `damping` the dampers reach the strings within the shortest lift
 * the rolls punch, so every lift damps. Under `brushing` their fall is
 * slowed until the quick runs of latch changes in the SUPRA corpus dip
 * without damping, at the price that lifts shorter than about 265 ms brush
 * as well.
 */
export const pedalPresets = {
    damping: pedalDefaults,
    brushing: pedalBrushing
} satisfies Record<string, Parameters>

export type PedalPreset = keyof typeof pedalPresets

/** The preset a set of pedal constants is, if it is one. */
export const pedalPresetOf = (pedals: Parameters): PedalPreset | undefined =>
    (Object.keys(pedalPresets) as PedalPreset[]).find(name => sameParameters(pedalPresets[name], pedals))

export type WelteT100Options = {
    /**
     * The take-up spool, which sets the time axis: it is held at a constant
     * rate of revolution, so the paper runs faster as the spool fills.
     */
    spool: Spool

    /** Constants of the nuancing mechanism, one set for each half of the keyboard: `nuanceOf` an instrument, or a set of one's own. */
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
     * The track at which the keyboard is divided, so that notes from
     * here upwards follow the treble expression and the ones below it
     * the bass. Which side an expression perforation itself belongs to
     * is not decided here but read off the tracker bar.
     */
    division: Track
}

export const defaultWelteT100Options: WelteT100Options = {
    spool: WELTE_SPOOL,
    nuance: nuanceOf(instruments.consensus),
    pedals: pedalPresets.damping,
    velocity: defaultVelocityMap,
    pedalMode: 'continuous',
    trackerBore: mm(TRACKER_BORE_MM),
    punchDiameter: mm(DEFAULT_PUNCH_MM),
    division: track(54)
}

/** What each expression code operates, in the emulator's terms. */
const CODES: Record<WelteT100ExpressionType, readonly [Control, Action]> = {
    MezzoforteOn: ['mezzoforte', 'on'],
    MezzoforteOff: ['mezzoforte', 'off'],
    SlowCrescendoOn: ['crescendo', 'on'],
    SlowCrescendoOff: ['crescendo', 'off'],
    ForzandoOn: ['sforzando', 'on'],
    ForzandoOff: ['sforzando', 'off'],
    SustainPedalOn: ['sustainPedal', 'on'],
    SustainPedalOff: ['sustainPedal', 'off'],
    SoftPedalOn: ['hammerRail', 'on'],
    SoftPedalOff: ['hammerRail', 'off'],
    MotorOn: ['windResistance', 'on'],
    MotorOff: ['windResistance', 'off'],
    Rewind: ['rewind', 'on'],
    ElectricCutOff: ['electricCutoff', 'on']
}

const isWelteT100ExpressionType = (type: string): type is WelteT100ExpressionType =>
    Object.hasOwn(CODES, type)

const codeOf = (expressionType: string) =>
    isWelteT100ExpressionType(expressionType) ? CODES[expressionType] : undefined

/** Paper the grid runs on past the last hole, so that a final pedal release completes. */
const RUN_OUT = mm(100)

const isNote = (event: NegotiatedEvent): event is NegotiatedEvent & Note => event.type === 'note'
const isExpression = (event: NegotiatedEvent): event is NegotiatedEvent & Expression => event.type === 'expression'

/** The row of the scan the constants were fitted on that a place on the roll falls in. */
const rowOf = (place: Millimeters): number => place * ROWS_PER_MM

const placeOfRow = (row: number): Millimeters => mm(row / ROWS_PER_MM)

/** When the spool brings a place on the roll to the tracker bar. */
export const secondsAt = (spool: Spool, place: Millimeters): Seconds =>
    seconds(paperSeconds(spool, inCentimeters(place)))

const halfOf = (note: NegotiatedEvent, division: Track): Half =>
    note.vertical.from >= division ? 'treble' : 'bass'

/** A perforation as the tracker bar meets it, kept with the symbol it carries. */
type Reading = {
    readonly event: NegotiatedEvent & Expression
    readonly punch: Punch
}

const readingOf = (event: NegotiatedEvent & Expression): Reading | undefined => {
    const code = codeOf(event.expressionType)
    if (!code) return undefined

    const half = event.scope
    const [control, action] = code
    return {
        event,
        punch: { half, control, action, rowOn: rowOf(event.horizontal.from), rowOff: rowOf(event.horizontal.to) }
    }
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * One sample per row of the scan the constants were fitted on, from the
 * beginning of the roll to a little past the last hole. The rows are
 * equally spaced on the paper and not in time, which is what the
 * emulator expects.
 */
const gridOver = (events: readonly NegotiatedEvent[], spool: Spool): Grid => {
    const last = mm(events.reduce((furthest, event) => Math.max(furthest, event.horizontal.to), 0))
    const length = Math.ceil(rowOf(add(last, RUN_OUT))) + 1
    const times = new Float64Array(length).map((_, row) => secondsAt(spool, placeOfRow(row)))
    return new Grid(0, times)
}

type Ports = ReturnType<typeof aperturePorts>
type Samples = Pick<DynamicsCurve, 'place' | 'seconds'>

const nuanceCurves = (
    grid: Grid,
    ports: Ports,
    samples: Samples,
    options: WelteT100Options
): Record<Half, DynamicsCurve> => {
    const instrument = instrumentNameOf(options.nuance) ?? 'custom'
    const curveOf = (half: Half): DynamicsCurve => {
        const params = options.nuance[half]
        const output = pneumaticModel.run({ grid, half, ports }, params)
        const travel = travelBetweenRails(output, params)
        const hook = clamp(mezzoforteTravel(params), 0.01, 0.99)
        return {
            ...samples,
            name: half,
            kind: 'dynamics',
            instrument: `Welte-Mignon T-100, ${instrument}`,
            travel,
            velocity: travel.map(value => velocityOf(value, hook, options.velocity))
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
        place: grid.seconds.map((_, row) => placeOfRow(row)),
        seconds: grid.seconds
    }

    const nuance = nuanceCurves(grid, ports, samples, options)
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
 * The red Welte, as welte-mignon-emulator models it: the take-up spool sets
 * the time axis, the Nuancierbälge fill through their conduits and are
 * arrested by the Mezzoforte pin, and the two pedals travel rather than
 * switch. The constants are the consensus fitted across the hand-drawn
 * nuance lines of six rolls, with the terms that describe the drawing
 * apparatus switched off; `instruments` offers each roll's own setting.
 */
export const welteT100System: ReproducingSystem<WelteT100Options> = {
    name: 'Welte-Mignon T100',
    trackerBar: welteT100,
    defaultOptions: defaultWelteT100Options,
    perform
}
