import {
    geometryInMm,
    Grid,
    levelChanges,
    mezzoforteTravel,
    paperSeconds,
    pedalBrushing,
    pedalDefaults,
    ROWS_PER_MM,
    travelBetweenRails,
    WELTE_T98_SPOOL,
    Half,
    Parameters,
    PedalMode,
    Spool,
} from "welte-mignon-emulator";
import {
    aperturePorts,
    CHAIN_GAP_MM,
    DERIVED,
    GENUINE,
    instrumentT98Of,
    labelOf,
    nuanceOf,
    PUNCH_T98_MM,
    pneumaticT98Model,
    rewindAt,
    runPedals,
    sforzandoPianoLift,
    STARTING_VALUES,
    TRACKER_BORE_T98_MM,
    Control,
    Punch,
    WelteT98InstrumentName,
} from "welte-mignon-emulator/t98";
import { Expression, Note } from "../../Symbol";
import { welteT98, WelteT98ExpressionType } from "./bar";
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
export type { WelteT98Instrument, WelteT98InstrumentName } from "welte-mignon-emulator/t98";

/**
 * The instruments the emulator offers for the green Welte, in three groups that
 * answer three different questions and must not be listed as one.
 *
 * A **genuine** instrument is fitted to the drawn nuance line of a green roll
 * and says what a green Welte did. A **derived** instrument is fitted so that
 * the green code of a recording reproduces what the fitted T-100 emulator makes
 * of the *red* copy of the same recording, and says what Welte's editor meant
 * the green roll to sound like; its provenance names the T-100 instrument it
 * inherits, since it is only as good as the red reading behind it. The
 * difference between the two, in the printed ordinate both scales share, is how
 * far the transfer of a red reading onto the green mechanism succeeded.
 *
 * Neither has been fitted yet, so both groups are empty and what a playback runs
 * on until then is the third group: the **unfitted** starting values, arithmetic
 * from Welte's regulation controls and the T-100 consensus with no green roll
 * behind any of it. A curve produced with them says so in its own `instrument`
 * field, and nothing should be published from them.
 */
export const instruments = { genuine: GENUINE, derived: DERIVED, unfitted: { 'starting-values': STARTING_VALUES } }

export const instrumentNames: readonly WelteT98InstrumentName[] = [
    ...Object.keys(GENUINE).map(genuine => ({ genuine }) as WelteT98InstrumentName),
    ...Object.keys(DERIVED).map(derived => ({ derived }) as WelteT98InstrumentName),
    { unfitted: 'starting-values' }
]

const sameParameters = (a: Parameters, b: Parameters): boolean =>
    Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([name, value]) => b[name] === value)

/** The instrument a pair of nuancing constants belongs to, if it is one. */
export const instrumentNameOf = (nuance: Record<Half, Parameters>): WelteT98InstrumentName | undefined =>
    instrumentNames.find(name => {
        const instrument = instrumentT98Of(name)
        return instrument !== undefined
            && sameParameters(instrument.bass, nuance.bass)
            && sameParameters(instrument.treble, nuance.treble)
    })

export { instrumentT98Of, labelOf, nuanceOf }

/**
 * The two readings of the pedal mechanism, which is the T-100's below the
 * command: Hagmann has the valves and bellows that carry out the movements "in
 * beiden Systemen dieselbe" (p. 106), and only the Vorpneumatik differs.
 */
export const pedalPresets = {
    damping: pedalDefaults,
    brushing: pedalBrushing
} satisfies Record<string, Parameters>

export type PedalPreset = keyof typeof pedalPresets

export const pedalPresetOf = (pedals: Parameters): PedalPreset | undefined =>
    (Object.keys(pedalPresets) as PedalPreset[]).find(name => sameParameters(pedalPresets[name], pedals))

export type WelteT98Options = {
    /**
     * The take-up spool, which sets the time axis. No source states a T-98
     * spool geometry, so the default keeps the red circumference and layer and
     * sets the revolution to make the initial paper speed 220 cm/min. It is
     * better varied than trusted: it scales every conductance by k and every
     * time constant by 1/k, and touches nothing dimensionless.
     */
    spool: Spool

    /** Constants of the nuancing mechanism, one set for each half of the keyboard. */
    nuance: Record<Half, Parameters>

    /** Which instrument those constants are, so that a curve can say so. */
    instrument: WelteT98InstrumentName

    /** Constants of the two pedal actions, one of `pedalPresets` or a set of one's own. */
    pedals: Parameters

    velocity: VelocityMap

    pedalMode: PedalMode

    /** Diameter of the tracker-bar bore. No source gives the T-98's; the red figure is carried over. */
    trackerBore: Millimeters

    /** Punch diameter for an edition whose copies record none. */
    punchDiameter: Millimeters

    /**
     * Chained punches whose gap is shorter than this are one perforation. A held
     * T-98 command is punched as a chain of round holes on a 2.66 mm grid with
     * paper bridges of about a millimetre, not as one slot, so a raw scan and an
     * edition whose collation has already made one symbol of the chain see the
     * same port only if the chain is merged.
     */
    chainGap: Millimeters

    /**
     * The track at which the keyboard is divided, so that notes from here
     * upwards follow the treble expression and the ones below it the bass.
     * Welte puts the division between f♯ and g (Betriebsanleitung p. 7), which
     * on this bar is track 52; PlaySK's green configuration independently gives
     * the last bass note as MIDI 66. Which side an expression perforation
     * belongs to is not decided here but read off the tracker bar.
     *
     * A green roll re-cut from a Mignon master uses only the middle 80 of the 88
     * note positions, so the division falls inside the used compass either way.
     */
    division: Track

    /**
     * What a long perforation on the bass sforzando-piano line does. It is the
     * same valve and the same hole as the dynamic (Skala-Rolle §10), so it
     * always acts as a sforzando-piano; `stop` additionally ends the performance
     * there, which is what the instrument does — during rewind the suction to
     * the primary pneumatics is cut and the Hauptventil closes, so no note
     * sounds and the expression apparatus is out of action (Betriebsanleitung
     * p. 17). `ignore` is for an edition that is a fragment, or that carries a
     * rewind in the middle for some reason of its own.
     */
    rewind: 'stop' | 'ignore'
}

export const defaultWelteT98Options: WelteT98Options = {
    spool: WELTE_T98_SPOOL,
    nuance: nuanceOf(STARTING_VALUES),
    instrument: { unfitted: 'starting-values' },
    pedals: pedalPresets.damping,
    velocity: defaultVelocityMap,
    pedalMode: 'continuous',
    trackerBore: mm(TRACKER_BORE_T98_MM),
    punchDiameter: mm(PUNCH_T98_MM),
    chainGap: mm(CHAIN_GAP_MM),
    division: track(52),
    rewind: 'stop'
}

/**
 * What each expression code operates, in the emulator's terms. There is no
 * action: a T-98 function lasts exactly as long as its perforation, so a symbol
 * carries its own extent and nothing cancels it. `SoftPedal` maps to the
 * emulator's `hammerRail`, which keeps Hagmann's part name rather than the
 * roll's function name.
 */
const CODES: Record<WelteT98ExpressionType, Control> = {
    SforzandoPiano: 'sforzandoPiano',
    SforzandoForte: 'sforzandoForte',
    Mezzoforte: 'mezzoforte',
    Crescendo: 'crescendo',
    SustainPedal: 'sustainPedal',
    SoftPedal: 'hammerRail'
}

const isWelteT98ExpressionType = (type: string): type is WelteT98ExpressionType =>
    Object.hasOwn(CODES, type)

const codeOf = (expressionType: string) =>
    isWelteT98ExpressionType(expressionType) ? CODES[expressionType] : undefined

/** Paper the grid runs on past the last hole, so that a final pedal release completes. */
const RUN_OUT = mm(100)

const isNote = (event: NegotiatedEvent): event is NegotiatedEvent & Note => event.type === 'note'
const isExpression = (event: NegotiatedEvent): event is NegotiatedEvent & Expression => event.type === 'expression'

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
    const control = codeOf(event.expressionType)
    if (!control) return undefined

    const half = event.scope
    return {
        event,
        punch: { half, control, rowOn: rowOf(event.horizontal.from), rowOff: rowOf(event.horizontal.to) }
    }
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * One sample per row of the scan the constants were fitted on, from the
 * beginning of the roll to a little past the last hole.
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
    options: WelteT98Options
): Record<Half, DynamicsCurve> => {
    const instrument = `Welte-Mignon T-98, ${labelOf(options.instrument)}`
    const curveOf = (half: Half): DynamicsCurve => {
        const params = options.nuance[half]
        const output = pneumaticT98Model.run({ grid, half, ports }, params)
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

const pedalCurves = (
    grid: Grid,
    ports: Ports,
    samples: Samples,
    options: WelteT98Options
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
    options: WelteT98Options
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
 * The travel of one pedal as controller steps, each attributed to the last
 * perforation of that pedal the tracker bar has reached.
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
 * The row at which the Abstellbalg trips and the roll goes back, or the end of
 * the grid where it never does. The shut-off hangs on the bass sforzando-piano
 * valve and reads the same perforations the dynamic does, so this asks the
 * emulator for that valve's lift and integrates it.
 */
const rewindRow = (grid: Grid, ports: Ports, options: WelteT98Options): number => {
    if (options.rewind === 'ignore') return grid.length
    const lift = sforzandoPianoLift({ grid, half: 'bass', ports }, options.nuance.bass)
    return rewindAt(lift, grid.dt) ?? grid.length
}

const truncated = <T extends { at: Seconds }>(events: readonly T[], until: Seconds): T[] =>
    events.filter(event => event.at <= until)

const cutCurve = <C extends DynamicsCurve | PedalCurve>(curve: C, rows: number): C => ({
    ...curve,
    place: curve.place.slice(0, rows),
    seconds: curve.seconds.slice(0, rows),
    travel: curve.travel.slice(0, rows),
    ...(curve.kind === 'dynamics' ? { velocity: curve.velocity.slice(0, rows) } : {})
})

/**
 * The edition's tempo adjustment is left aside, as on the T-100: it is stated as
 * a paper speed, and what the spool holds constant is its rate of revolution.
 */
const perform = (
    events: readonly NegotiatedEvent[],
    options: WelteT98Options,
    roll: RollProperties
): Performance => {
    const readings = events
        .filter(isExpression)
        .map(readingOf)
        .filter((reading): reading is Reading => reading !== undefined)
    const grid = gridOver(events, options.spool)
    const geometry = geometryInMm(roll.punchDiameter ?? options.punchDiameter, options.trackerBore)
    const gap = options.chainGap * ROWS_PER_MM
    const ports = aperturePorts(grid, readings.map(reading => reading.punch), geometry, gap)
    const samples: Samples = {
        place: grid.seconds.map((_, row) => placeOfRow(row)),
        seconds: grid.seconds
    }

    const nuance = nuanceCurves(grid, ports, samples, options)
    const pedals = pedalCurves(grid, ports, samples, options)
    const readingsOf = (control: Control) => readings.filter(reading => reading.punch.control === control)

    const stops = rewindRow(grid, ports, options)
    const until = seconds(grid.seconds[Math.min(stops, grid.length - 1)]!)
    const rows = Math.min(stops + 1, grid.length)

    return {
        events: truncated([
            ...performNotes(events, grid, nuance, options),
            ...performPedal('damper', pedals.damper, grid, readingsOf('sustainPedal'), options.pedalMode),
            ...performPedal('hammerRail', pedals.hammerRail, grid, readingsOf('hammerRail'), options.pedalMode)
        ], until),
        curves: [nuance.bass, nuance.treble, pedals.damper, pedals.hammerRail].map(curve => cutCurve(curve, rows))
    }
}

/**
 * The green Welte, as welte-mignon-emulator models it. Everything downstream of
 * the relay is the T-100's, on Hagmann's authority that the nuancing unit is
 * built the same for both tracker scales (p. 96); what differs is in front of
 * it. Each function is held for exactly as long as its own perforation runs
 * over the glide block, four conduits stand on one bellows and their drives add
 * as flows, the crescendo's ceiling is the balance of throttle 98 against the
 * permanently open bore 100, and a long perforation on the bass sforzando-piano
 * line sends the roll back.
 *
 * Its constants are **not fitted**. `instruments.genuine` and
 * `instruments.derived` are empty until their fits run, and what a playback runs
 * on until then is the unfitted starting values, which every curve says.
 */
export const welteT98System: ReproducingSystem<WelteT98Options> = {
    name: 'Welte-Mignon T98',
    trackerBar: welteT98,
    defaultOptions: defaultWelteT98Options,
    perform
}
