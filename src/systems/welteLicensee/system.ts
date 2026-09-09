import { CONSENSUS } from "welte-mignon-emulator/t100";
import { Half, Parameters } from "welte-mignon-emulator";
import { track } from "../../Quantity";
import { ReproducingSystem } from "../../ReproducingSystem";
import { welteLicensee } from "./bar";
import {
    defaultWelteT100Options,
    instrumentNameOf,
    nuanceOf,
    performAs,
    type WelteT100Options
} from "../welteT100/system";

export type WelteLicenseeOptions = WelteT100Options

/**
 * The one instrument on offer, and it is not a Licensee instrument.
 *
 * These are the T-100 consensus constants, fitted across the hand-drawn
 * nuance lines of six rolls played on Freiburg instruments. Nothing here was
 * measured on a Licensee: no Licensee roll is known to carry a drawn line, no
 * Licensee instrument has been fitted, and the published prior art does not
 * agree with itself — the same 186 ms is a part stroke in midi2exp and a whole
 * stroke in pianolatron, a factor of 2.2.
 *
 * So a Licensee playback is a Freiburg reading of American paper, and the
 * union has one arm to keep that visible. Nothing should be published from it.
 */
export const instruments = { unfitted: { 'welte-t100-consensus': CONSENSUS } }

export type WelteLicenseeInstrumentName = { unfitted: 'welte-t100-consensus' }

export const instrumentNames: readonly WelteLicenseeInstrumentName[] = [
    { unfitted: 'welte-t100-consensus' }
]

/**
 * Welte's own spool is carried over with the constants. Phillips (p. 181) says
 * Licensee rolls "play at a range of paper speeds", so there is no one figure
 * to put here and the red geometry is a placeholder rather than a reading.
 * Where an edition states a tempo of its own it is the better authority, and
 * the spool is better varied than trusted: it scales every conductance by k
 * and every time constant by 1/k, and touches nothing dimensionless.
 */
export const defaultWelteLicenseeOptions: WelteLicenseeOptions = {
    ...defaultWelteT100Options,
    nuance: nuanceOf(CONSENSUS),

    /**
     * Two positions lower than the T-100's 54: the Licensee drops the two
     * motor tracks, so the note block and the treble valves sit two places in
     * (Hagmann p. 40 f., Phillips p. 123).
     */
    division: track(52)
}

/** Never the bare name of a T-100 instrument: a curve from here has to say what it ran on. */
const licenseeInstrument = (nuance: Record<Half, Parameters>): string =>
    instrumentNameOf(nuance) === 'consensus'
        ? 'Welte-Mignon (Licensee), unfitted — Welte-Mignon T-100 consensus'
        : 'Welte-Mignon (Licensee), custom'

/**
 * Welte-Mignon (Licensee), the American re-cut. It keeps the T-100's
 * lock-and-cancel coding on 98 tracks — which is what separates it from the
 * green, the coding rule rather than the track count (Phillips, Table 4.3) —
 * so it reads the same commands and is played by the same mechanism.
 *
 * What it does not have is an instrument of its own. The constants are the
 * T-100's, the spool is the T-100's, and neither has ever been checked against
 * a Licensee. `instruments` therefore offers a single `unfitted` arm, and every
 * curve produced here names itself as such.
 */
export const welteLicenseeSystem: ReproducingSystem<WelteLicenseeOptions> = {
    name: 'Welte-Mignon (Licensee)',
    trackerBar: welteLicensee,
    defaultOptions: defaultWelteLicenseeOptions,
    perform: performAs(licenseeInstrument)
}
