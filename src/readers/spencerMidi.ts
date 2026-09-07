import { v4 } from "uuid";
import { read } from "midifile-ts";
import { asSpans } from "./midiSpans";
import { Hole } from "../Feature";
import { RollCopy } from "../RollCopy";

/**
 * How a MIDI key number in one of Spencer Chase's roll files names a
 * tracker bar track.
 *
 * The note block follows the obvious rule, `pitch - 13`, which puts
 * track 11 on MIDI 24 as the T100 compass requires. The bass expression
 * block does not: it reads two tracks high, and subtracting two is what
 * has made these files come out right so far.
 *
 * The boundary between the two rules is unresolved. Taken literally the
 * rules leave tracks 8 and 9 unreachable and jump from track 7 to track 10,
 * which no lateral offset can produce, so at least one of them is
 * approximate. Settling it needs a Spencer file whose expression holes
 * can be checked against the roll, hence the option to override.
 */
export const spencerTrackOf = (pitch: number) => {
    const track = pitch - 13
    return track < 10 ? track - 2 : track
}

const MM_PER_FOOT = 304.8

/**
 * Spencer Chase's rolls seem to be scanned at a roll speed of
 * 83 (=8.3 feet per minute). A scanner feeds the paper at one
 * speed, so time in his files is proportional to place.
 */
export const SPENCER_FEET_PER_MINUTE = 8.3

/** Place on the roll in mm after `seconds` at a constant `feetPerMinute`. */
export const atConstantSpeed = (feetPerMinute: number) =>
    (seconds: number): number => feetPerMinute * MM_PER_FOOT / 60 * seconds

export function readFromSpencerMIDI(
    midiBuffer: ArrayBuffer,
    placeAt: (seconds: number) => number = atConstantSpeed(SPENCER_FEET_PER_MINUTE),
    trackOf: (pitch: number) => number = spencerTrackOf
): RollCopy {
    const features = asSpans(read(midiBuffer))
        .filter(span => span.type === 'note')
        .map((span): Hole => ({
            type: 'Hole',
            id: v4(),
            vertical: {
                from: trackOf(span.pitch),
                unit: 'track'
            },
            horizontal: {
                from: placeAt(span.onsetMs / 1000),
                to: placeAt(span.offsetMs / 1000),
                unit: 'mm'
            }
        }))

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        keeper: { name: '', sameAs: [] },
        measurements: {},
        modifications: [],
        features
    }
}

