import { v4 } from "uuid";
import { Hole } from "../Feature";
import { RollCopy } from "../RollCopy";
import { welteT100 } from "../systems/welteT100/bar";
import { inMillimeters, px, Track, track } from "../Quantity";

/**
 * Spencer Chase's e-roll file (`.bar`, "eRoll Tracker Bar Image") holds
 * a roll as a list of events: a distance in rows of the scanned image,
 * then the tracker bar position whose hole begins or ends on that row.
 *
 * Layout, as read off W225E.bar: four bytes (00 01 00 00), the tag F4
 * and a null-terminated text ("/oldtrackname:..."), then the events,
 * each an unsigned LEB128 distance and one position byte. A position
 * byte of FF closes the list. A hole ends when its position turns up
 * a second time.
 */
const TEXT_AT = 4
const TEXT_TAG = 0xF4
const END_OF_EVENTS = 0xFF

/**
 * Rows of the image on an inch of paper. The player reads eight rows a
 * second per unit of roll tempo (tempo 80 comes with a sample rate of
 * 640 Hz), and the tempo counts tenths of a foot per minute, which puts
 * 400 rows on an inch. This is the file's own calibration; whether the
 * scanner kept it is for an alignment with other copies to tell.
 */
export const SPENCER_ROWS_PER_INCH = 400

/**
 * The file numbers positions as the 98-hole Welte Licensee bar does.
 * Its bass controls are the T-100's tracks 1 to 8, it has no motor
 * tracks, and its note block follows the controls at once, so from
 * there on every position lies two tracks lower than on the T-100 bar.
 * Checked valve by valve on roll 225 against the Stanford copies.
 */
const LICENSEE_NOTES_FROM = 9
const T100_NOTES_FROM = welteT100.areas.find(area => area.role === 'note')!.from

export const licenseeOnT100 = (position: number): Track =>
    track(position < LICENSEE_NOTES_FROM ? position : position + T100_NOTES_FROM - LICENSEE_NOTES_FROM)

export interface SpencerBarOptions {
    /** Rows of the image on an inch of paper. */
    rowsPerInch?: number

    /** Puts a position the file names onto the edition's bar. */
    trackOf?: (position: number) => Track
}

interface BarEvent {
    row: number
    position: number
}

interface BarHole {
    position: number
    from: number
    to: number
}

const byteAt = (bytes: Uint8Array, at: number): number => {
    const byte = bytes[at]
    if (byte === undefined) throw new Error(`Spencer .bar file ends early at byte ${at}`)
    return byte
}

const leb128 = (bytes: Uint8Array, at: number): { value: number, next: number } => {
    let value = 0
    let next = at
    for (let weight = 1; ; weight *= 128) {
        const byte = byteAt(bytes, next++)
        value += (byte & 0x7F) * weight
        if (!(byte & 0x80)) return { value, next }
    }
}

const endOfText = (bytes: Uint8Array, from: number): number => {
    const end = bytes.indexOf(0, from)
    if (end < 0) throw new Error('Spencer .bar file: the text is not terminated')
    return end + 1
}

function* eventsIn(bytes: Uint8Array, from: number): Generator<BarEvent> {
    let row = 0
    let at = from
    while (true) {
        const distance = leb128(bytes, at)
        const position = byteAt(bytes, distance.next)
        if (position === END_OF_EVENTS) return
        row += distance.value
        yield { row, position }
        at = distance.next + 1
    }
}

/** Pairs the events of each position into holes: the first opens one, the next closes it. */
const holesOf = (events: Iterable<BarEvent>): BarHole[] => {
    const open = new Map<number, number>()
    const holes: BarHole[] = []
    for (const { row, position } of events) {
        const from = open.get(position)
        if (from === undefined) {
            open.set(position, row)
        } else {
            holes.push({ position, from, to: row })
            open.delete(position)
        }
    }
    if (open.size > 0) {
        throw new Error(`Spencer .bar file: holes on positions ${[...open.keys()].join(', ')} never end`)
    }
    return holes.sort((a, b) => a.from - b.from)
}

export function readFromSpencerBar(
    buffer: ArrayBuffer,
    { rowsPerInch = SPENCER_ROWS_PER_INCH, trackOf = licenseeOnT100 }: SpencerBarOptions = {}
): RollCopy {
    const bytes = new Uint8Array(buffer)
    if (byteAt(bytes, TEXT_AT) !== TEXT_TAG) {
        throw new Error('Not a Spencer .bar file: no text after the header')
    }

    const placeOf = (row: number) => inMillimeters(px(row), rowsPerInch)

    const features = holesOf(eventsIn(bytes, endOfText(bytes, TEXT_AT + 1)))
        .map((hole): Hole => ({
            type: 'Hole',
            id: v4(),
            vertical: {
                from: trackOf(hole.position),
                unit: 'track'
            },
            horizontal: {
                unit: 'mm',
                from: placeOf(hole.from),
                to: placeOf(hole.to)
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
