import { v4 } from "uuid";
import { read } from "midifile-ts";
import { asSpans } from "./midiSpans";
import { Hole } from "../Feature";
import { RollCopy } from "../RollCopy";
import { FeetPerMinute, feetPerMinute, inSeconds, Millimeters, mm, Seconds, Track, track } from "../Quantity";

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
export const spencerTrackOf = (pitch: number): Track => {
    const position = pitch - 13
    return track(position < 10 ? position - 2 : position)
}

const MM_PER_FOOT = 304.8
const SECONDS_PER_MINUTE = 60

/**
 * Spencer Chase's rolls seem to be scanned at a roll speed of
 * 83 (=8.3 feet per minute). A scanner feeds the paper at one
 * speed, so time in his files is proportional to place.
 */
export const SPENCER_FEET_PER_MINUTE = feetPerMinute(8.3)

/** Place on the roll after `time` at a constant `speed`. */
export const atConstantSpeed = (speed: FeetPerMinute) =>
    (time: Seconds): Millimeters => mm(speed * MM_PER_FOOT / SECONDS_PER_MINUTE * time)

export function readFromSpencerMIDI(
    midiBuffer: ArrayBuffer,
    placeAt: (time: Seconds) => Millimeters = atConstantSpeed(SPENCER_FEET_PER_MINUTE),
    trackOf: (pitch: number) => Track = spencerTrackOf
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
                from: placeAt(inSeconds(span.onsetMs)),
                to: placeAt(inSeconds(span.offsetMs)),
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
