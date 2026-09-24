import {
    DEFAULT_PUNCH_MM,
    pedalBrushing,
    pedalDefaults,
    TRACKER_BORE_MM,
    WELTE_SPOOL,
    Half,
    Parameters,
} from "welte-mignon-emulator";
import {
    aperturePorts,
    CONSENSUS,
    pneumaticModel,
    PRESETS,
    runPedals,
    Action,
    Control,
    Instrument,
    Punch,
    RollNumber,
} from "welte-mignon-emulator/t100";
import { Expression } from "../../Symbol.js";
import { welteT100, WelteT100ExpressionType } from "./bar.js";
import { NegotiatedEvent, Performance, ReproducingSystem, RollProperties } from "../../ReproducingSystem.js";
import { mm, track } from "../../Quantity.js";
import { defaultVelocityMap } from "../velocity.js";
import { performWelte, sameParameters, type WelteOptions } from "../welte.js";

export type { VelocityMap } from "../velocity.js";
export { secondsAt } from "../welte.js";

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

/** The T-100 takes the options every Welte system does; see `WelteOptions`. */
export type WelteT100Options = WelteOptions

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

/** The punch a T-100 expression is read as: its control, latched on or off. */
const punchOf = (event: NegotiatedEvent & Expression, rows: { rowOn: number, rowOff: number }): Punch | undefined => {
    if (!isWelteT100ExpressionType(event.expressionType)) return undefined
    const [control, action]: readonly [Control, Action] = CODES[event.expressionType]
    return { half: event.scope, control, action, ...rows }
}

/**
 * The mechanism, given a way of naming the instrument on the curves it
 * produces. The Licensee reads the same commands and is played by the same
 * valves, so it shares this; what it may not share is the name, since a
 * Licensee playback runs on constants fitted to Freiburg instruments and the
 * curve has to say so.
 */
export const performAs = (instrumentOf: (nuance: Record<Half, Parameters>) => string) => (
    events: readonly NegotiatedEvent[],
    options: WelteT100Options,
    roll: RollProperties
): Performance => {
    const { events: performed, curves } = performWelte(events, options, roll, {
        punchOf,
        portsOf: aperturePorts,
        model: pneumaticModel,
        runPedals,
        instrument: instrumentOf(options.nuance)
    })
    return { events: performed, curves }
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
    perform: performAs(nuance => `Welte-Mignon T-100, ${instrumentNameOf(nuance) ?? 'custom'}`)
}
