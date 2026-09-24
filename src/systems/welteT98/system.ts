import {
    pedalBrushing,
    pedalDefaults,
    ROWS_PER_MM,
    WELTE_T98_SPOOL,
    Grid,
    Half,
    Parameters,
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
import { Expression } from "../../model/Symbol.js";
import { welteT98, WelteT98ExpressionType } from "./bar.js";
import {
    DynamicsCurve,
    NegotiatedEvent,
    PedalCurve,
    Performance,
    ReproducingSystem,
    RollProperties
} from "../ReproducingSystem.js";
import { Millimeters, mm, Seconds, seconds, track } from "../../model/Quantity.js";
import { defaultVelocityMap } from "../velocity.js";
import { performWelte, Ports, sameParameters, type WelteOptions } from "../welte.js";

export type { VelocityMap } from "../velocity.js";
export { secondsAt } from "../welte.js";
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
 * Both are now fitted, on `welte-mignon-emulator` 1.1.0: five genuine
 * instruments, one per lined green roll that could be read, a consensus across
 * them, and the derived instrument for the one recording issued on both scales.
 * The **unfitted** starting values remain as a third group, arithmetic from
 * Welte's regulation controls with no green roll behind any of it, and a curve
 * produced with them says so in its own `instrument` field.
 *
 * **Prefer a roll's own instrument where the roll is one of the five.** The
 * green instruments disagree with one another far more than the red ones do:
 * the consensus is held out at 0.121 on the bass where the per-roll instruments
 * are 0.029 to 0.066, because a shared mechanism describes none of them well.
 * That spread is a property of the instruments rather than of the fit, and
 * Gottschewski's finding that they were out of regulation is visible in it.
 */
export const instruments = { genuine: GENUINE, derived: DERIVED, unfitted: { 'starting-values': STARTING_VALUES } }

export const instrumentNames: readonly WelteT98InstrumentName[] = [
    ...Object.keys(GENUINE).map(genuine => ({ genuine }) as WelteT98InstrumentName),
    ...Object.keys(DERIVED).map(derived => ({ derived }) as WelteT98InstrumentName),
    { unfitted: 'starting-values' }
]

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

/**
 * The options every Welte system takes (see `WelteOptions`), with what the
 * T-98 adds. No source states a T-98 spool geometry, so the default keeps the
 * red circumference and layer and sets the revolution to make the initial
 * paper speed 220 cm/min; it is better varied than trusted, since it scales
 * every conductance by k and every time constant by 1/k and touches nothing
 * dimensionless. No source gives the T-98's tracker bore either, and the red
 * figure is carried over. Welte puts the division between f♯ and g
 * (Betriebsanleitung p. 7), which on this bar is track 52; PlaySK's green
 * configuration independently gives the last bass note as MIDI 66. A green
 * roll re-cut from a Mignon master uses only the middle 80 of the 88 note
 * positions, so the division falls inside the used compass either way.
 */
export type WelteT98Options = WelteOptions & {
    /** Which instrument the nuancing constants are, so that a curve can say so. */
    instrument: WelteT98InstrumentName

    /**
     * Chained punches whose gap is shorter than this are one perforation. A held
     * T-98 command is punched as a chain of round holes on a 2.66 mm grid with
     * paper bridges of about a millimetre, not as one slot, so a raw scan and an
     * edition whose collation has already made one symbol of the chain see the
     * same port only if the chain is merged.
     */
    chainGap: Millimeters

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
    nuance: nuanceOf(GENUINE.consensus!),
    instrument: { genuine: 'consensus' },
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

/** The punch a T-98 expression is read as: its control, held for as long as it runs. */
const punchOf = (event: NegotiatedEvent & Expression, rows: { rowOn: number, rowOff: number }): Punch | undefined =>
    isWelteT98ExpressionType(event.expressionType)
        ? { half: event.scope, control: CODES[event.expressionType], ...rows }
        : undefined

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
 * The shared Welte performance, cut off where the rewind takes hold unless
 * the options ignore it.
 */
const perform = (
    events: readonly NegotiatedEvent[],
    options: WelteT98Options,
    roll: RollProperties
): Performance => {
    const gap = options.chainGap * ROWS_PER_MM
    const { grid, ports, events: performed, curves } = performWelte(events, options, roll, {
        punchOf,
        portsOf: (grid, punches, geometry) => aperturePorts(grid, punches, geometry, gap),
        model: pneumaticT98Model,
        runPedals,
        instrument: `Welte-Mignon T-98, ${labelOf(options.instrument)}`
    })

    const stops = rewindRow(grid, ports, options)
    const until = seconds(grid.seconds[Math.min(stops, grid.length - 1)]!)
    const rows = Math.min(stops + 1, grid.length)

    return {
        events: truncated(performed, until),
        curves: curves.map(curve => cutCurve(curve, rows))
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
 * Its constants are fitted to the drawn nuance lines of five green rolls, and a
 * playback runs on the consensus across them unless the caller names another
 * instrument. Where the roll being played is one of the five, its own instrument
 * is the better choice and `instruments.genuine` carries it.
 */
export const welteT98System: ReproducingSystem<WelteT98Options> = {
    name: 'Welte-Mignon T98',
    trackerBar: welteT98,
    defaultOptions: defaultWelteT98Options,
    perform
}
