import { HoleChain } from '../src/model/Feature'
import { RollCopy } from '../src/model/RollCopy'
import { mm } from '../src/model/Quantity'
import { systemOf, TrackerBar } from '../src/systems/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { copy } from './editionFixture'

export interface Note {
    pitch: number
    from: number
    to: number
}

/** A deterministic stand-in for Math.random. */
export const generator = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
}

/**
 * A piece of `count` notes on the axis, from 100 mm on: an opening that
 * is played twice, so that its runs of pitches occur more than once,
 * then a continuation.
 */
export const piece = (seed: number, count = 300): Note[] => {
    const random = generator(seed)
    const notes: Note[] = []
    let at = 100
    while (notes.length < count) {
        at += 4 + random() * 36
        const chord = 1 + Math.floor(random() * 3)
        for (let voice = 0; voice < chord; voice++) {
            notes.push({ pitch: 36 + Math.floor(random() * 60), from: at + voice * 0.4, to: at + 8 + random() * 50 })
        }
    }
    const opening = notes.slice(0, 60)
    const openingLength = notes[60].from - opening[0].from
    const repeated = opening.map(note => ({ ...note, from: note.from + openingLength, to: note.to + openingLength }))
    const continuation = notes.slice(60).map(note => ({ ...note, from: note.from + openingLength, to: note.to + openingLength }))
    return [...opening, ...repeated, ...continuation]
}

/** The track the bar sounds the pitch from. */
const trackOf = (bar: TrackerBar, pitch: number) => {
    const position = bar.positionOf({ type: 'note', pitch })
    if (position === undefined) throw new Error(`the ${bar.name} sounds no pitch ${pitch}`)
    return position
}

/**
 * A copy of the piece cut for the bar, at its own places: those that
 * `(x + shift) · scale` carries onto the piece's.
 */
export const copyOfPiece = (
    id: string,
    notes: readonly Note[],
    { shift = 0, scale = 1, bar = welteT100 }: { shift?: number, scale?: number, bar?: TrackerBar } = {}
): RollCopy => {
    const own = (place: number) => mm(place / scale - shift)
    const holes: HoleChain[] = notes.map((note, i) => ({
        type: 'HoleChain',
        id: `${id}-${i}`,
        horizontal: { unit: 'mm', from: own(note.from), to: own(note.to) },
        vertical: { unit: 'track', from: trackOf(bar, note.pitch) }
    }))
    return { ...copy(id, holes), production: { system: systemOf(bar), produced: holes } }
}
