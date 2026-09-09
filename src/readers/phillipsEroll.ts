import { AnyEvent, read } from "midifile-ts";
import { v4 } from "uuid";
import { assignObject } from "../Assumption";
import { Hole } from "../Feature";
import { RollCopy } from "../RollCopy";
import { systemOf, TrackerBar } from "../TrackerBar";
import { welteT100 } from "../systems/welteT100/bar";
import { welteLicensee } from "../systems/welteLicensee/bar";
import { inMetersPerMinute, Millimeters, mm, Seconds, seconds, Track, track } from "../Quantity";

/**
 * Peter Phillips's "e-roll" file, the unprocessed output of his
 * pneumatic roll reader (thesis pp. 182–196): the roll runs over a
 * tracker bar and a switch on every position writes a MIDI note as its
 * perforation passes. Every position is there, expression included, all
 * at one velocity. His other product, the standard MIDI file, has the
 * expression decoded into velocities already and cannot be read as a
 * roll.
 *
 * Two things follow from a reader rather than a scanner. The events are
 * elapsed time, not paper, and the take-up spool accelerates the paper
 * as it fills, so `placeAt` has to put the time back onto the paper.
 * And a switch stays open longer than its perforation is long, so a
 * hole read here runs past the punched one.
 */

/**
 * He numbers his files by two rules at once, which his free samples
 * show and which follow from what the file is for. A note carries the
 * MIDI number it sounds, so that the file plays on a MIDI instrument
 * without translation. An expression position, having no pitch to
 * carry, is numbered by its place on the bar plus a fixed offset: on a
 * red e-roll the sustain commands sit at 107 and 108 for positions 93
 * and 94, and the soft pedal at 21 and 22 for positions 7 and 8, so the
 * offset is fourteen.
 *
 * The two rules collide on one number, the lowest note of the T-100
 * sharing 24 with the tenth position. Notes win there, the note block
 * being the larger claim; none of his samples uses the number at all.
 */
export const CONTROL_OFFSET: Readonly<Record<string, number>> = {
    'welte-t100': 14,
    'welte-licensee': 15
}

export interface PhillipsErollOptions {
    /**
     * The bar the file numbers its positions by, which is the bar of
     * the roll he read.
     */
    system?: TrackerBar

    /**
     * How far above its position an expression number sits. Defaults to
     * what his samples show for that bar.
     */
    controlOffset?: number

    /**
     * Where on the paper the roll had run after so many seconds. The
     * default is the constant speed the system states, which ignores
     * the take-up spool; pass `paperAt` of welte-mignon-emulator to
     * account for it.
     */
    placeAt?: (elapsed: Seconds) => Millimeters
}

/** A note as the file spells it, in ticks. */
interface ErollNote {
    pitch: number
    from: number
    to: number
}

/** The tempo in force from a tick onwards, as microseconds to the beat. */
interface TempoChange {
    at: number
    microsecondsPerBeat: number
}

const DEFAULT_TEMPO = 500_000

const isNoteOn = (event: AnyEvent): boolean =>
    event.type === 'channel' && event.subtype === 'noteOn' && event.velocity > 0

const isNoteOff = (event: AnyEvent): boolean =>
    event.type === 'channel' && (event.subtype === 'noteOff' || (event.subtype === 'noteOn' && event.velocity === 0))

/** The events of every track on one clock, since a note may end on another track than it began. */
const onOneClock = (tracks: AnyEvent[][]): { at: number, event: AnyEvent }[] =>
    tracks
        .flatMap(events => {
            let at = 0
            return events.map(event => ({ at: at += event.deltaTime, event }))
        })
        .sort((a, b) => a.at - b.at)

const temposIn = (timed: { at: number, event: AnyEvent }[]): TempoChange[] => {
    const changes = timed.flatMap(({ at, event }) =>
        event.type === 'meta' && event.subtype === 'setTempo'
            ? [{ at, microsecondsPerBeat: event.microsecondsPerBeat }]
            : [])
    return changes.length > 0 && changes[0].at === 0
        ? changes
        : [{ at: 0, microsecondsPerBeat: DEFAULT_TEMPO }, ...changes]
}

/**
 * Turns a tick into elapsed seconds, following the tempo changes. His
 * files carry one tempo, but a file written by hand may carry several.
 */
const clockOf = (tempos: TempoChange[], ticksPerBeat: number) => {
    /** Microseconds elapsed at the start of each tempo, the first being zero. */
    const elapsedBefore = tempos.map((_, index) =>
        tempos
            .slice(0, index)
            .reduce((total, tempo, at) => total + (tempos[at + 1].at - tempo.at) * tempo.microsecondsPerBeat, 0))

    return (tick: number): Seconds => {
        const index = Math.max(tempos.findLastIndex(tempo => tempo.at <= tick), 0)
        const microseconds = elapsedBefore[index] + (tick - tempos[index].at) * tempos[index].microsecondsPerBeat
        return seconds(microseconds / ticksPerBeat / 1_000_000)
    }
}

/** Pairs note-on with the next note-off of the same pitch. */
const notesIn = (timed: { at: number, event: AnyEvent }[]): ErollNote[] => {
    const open = new Map<number, number[]>()
    const notes: ErollNote[] = []
    timed.forEach(({ at, event }) => {
        if (event.type !== 'channel' || !('noteNumber' in event)) return
        const pitch = event.noteNumber
        if (isNoteOn(event)) {
            open.set(pitch, [...(open.get(pitch) ?? []), at])
        } else if (isNoteOff(event)) {
            const [from, ...rest] = open.get(pitch) ?? []
            if (from === undefined) return
            open.set(pitch, rest)
            notes.push({ pitch, from, to: at })
        }
    })
    return notes.sort((a, b) => a.from - b.from || a.pitch - b.pitch)
}

/** Paper run at the constant speed the system states, for a bar that states one. */
const atStatedSpeed = (system: TrackerBar) => {
    const speed = system.paperSpeed
    if (!speed) {
        throw new Error(
            `Phillips e-roll: the ${system.name} states no paper speed, so pass placeAt to say where the paper had run`
        )
    }
    const perSecond = inMetersPerMinute(speed) * 1000 / 60
    return (elapsed: Seconds): Millimeters => mm(elapsed * perSecond)
}

const controlOffsetOf = (system: TrackerBar, given: number | undefined): number => {
    const measured = given ?? CONTROL_OFFSET[system.id]
    if (measured === undefined) {
        throw new Error(
            `Phillips e-roll: no control offset is known for the ${system.name}, so pass controlOffset to say how far above its position an expression number sits`
        )
    }
    return measured
}

/** The position each note of the bar sounds from. */
const positionsByPitch = (bar: TrackerBar): Map<number, Track> =>
    new Map(
        Array.from({ length: bar.trackCount }, (_, index) => track(index + 1))
            .flatMap((position): [number, Track][] => {
                const meaning = bar.meaningOf(position)
                return meaning?.type === 'note' ? [[meaning.pitch, position]] : []
            })
    )

/**
 * Reads one of his e-roll files as a copy of the roll, in millimetres
 * of paper, on the bar it was cut for and in that bar's numbering. A
 * position the bar does not read is left out, as the bar would leave it.
 */
export function readFromPhillipsEroll(
    buffer: ArrayBuffer,
    {
        system = welteT100,
        controlOffset,
        placeAt
    }: PhillipsErollOptions = {}
): RollCopy {
    const file = read(new Uint8Array(buffer))
    const timed = onOneClock(file.tracks)
    const elapsedAt = clockOf(temposIn(timed), file.header.ticksPerBeat)
    const place = placeAt ?? atStatedSpeed(system)
    const offset = controlOffsetOf(system, controlOffset)
    const notePositions = positionsByPitch(system)

    const positionOf = (number: number): Track =>
        notePositions.get(number) ?? track(number - offset)

    const features = notesIn(timed).flatMap((note): Hole[] => {
        const position = positionOf(note.pitch)
        if (!system.meaningOf(position)) return []

        return [{
            type: 'Hole',
            id: v4(),
            vertical: { from: position, unit: 'track' },
            horizontal: {
                unit: 'mm',
                from: place(elapsedAt(note.from)),
                to: place(elapsedAt(note.to))
            }
        }]
    })

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        keeper: { name: '', sameAs: [] },
        measurements: {},
        production: { system: systemOf(system) },
        modifications: [],
        features,
        readFrom: {
            kind: 'recording',
            actor: assignObject({ name: 'Phillips, Peter', sameAs: [] }),
            note: 'Read on Phillips’s pneumatic roll reader. The places are elapsed time put back onto the paper, and a hole runs as long as its switch stayed open, which is longer than the perforation.'
        }
    }
}

/** The bars his files are known to be numbered by. */
export const phillipsSystems: readonly TrackerBar[] = [welteT100, welteLicensee]
