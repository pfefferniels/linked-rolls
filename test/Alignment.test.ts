import { describe, expect, it } from 'vitest'
import { alignFeatures } from '../src/alignment'
import { AnyFeature, Hole } from '../src/Feature'
import { mm, track } from '../src/Quantity'
import { welteT100 } from '../src/systems/welteT100/bar'

interface Note {
    pitch: number
    from: number
    to: number
}

/** A deterministic stand-in for Math.random. */
const generator = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
}

const LOWEST_NOTE_TRACK = 11
const LOWEST_PITCH = 24

const hole = (tracked: number, from: number, to: number): Hole => ({
    type: 'Hole',
    id: `${tracked}@${from}`,
    vertical: { unit: 'track', from: track(tracked) },
    horizontal: { unit: 'mm', from: mm(from), to: mm(to) }
})

const noteHole = ({ pitch, from, to }: Note): Hole => hole(pitch - LOWEST_PITCH + LOWEST_NOTE_TRACK, from, to)

/**
 * A piece of `count` notes: an opening that is played twice, so that
 * its runs of pitches occur more than once, then a continuation.
 */
const piece = (seed: number, count = 300): Note[] => {
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

const SCALE = 1.3
const SHIFT = 792

/** The place on the copy that the alignment `(x + SHIFT) · SCALE` carries onto `b`. */
const onCopy = (b: number): number => b / SCALE - SHIFT

const asCopy = (notes: readonly Note[]): Note[] =>
    notes.map(note => ({ ...note, from: onCopy(note.from), to: onCopy(note.to) }))

const reference = piece(1)
const copy = asCopy(reference)

const roll = (notes: readonly Note[]): AnyFeature[] => notes.map(noteHole)

describe('aligning two copies of a roll', () => {
    it('recovers the shift and scale of an exact copy', () => {
        const result = alignFeatures(roll(copy), roll(reference))!
        expect(result.scale).toBeCloseTo(SCALE, 9)
        expect(result.shift).toBeCloseTo(SHIFT, 6)
        expect(result.matched).toBe(reference.length)
        expect(result.residual).toBeCloseTo(0, 6)
    })

    it('puts a copy onto itself with no shift and a scale of one', () => {
        const result = alignFeatures(roll(reference), roll(reference))!
        expect(result.scale).toBeCloseTo(1, 9)
        expect(result.shift).toBeCloseTo(0, 6)
    })

    it('is unmoved by a pattern that precedes the music on one copy', () => {
        const pattern = Array.from({ length: 40 }, (_, i) => ({ pitch: 36 + i, from: -900 + i * 3, to: -899 + i * 3 }))
        const result = alignFeatures(roll([...pattern, ...copy]), roll(reference))!
        expect(result.scale).toBeCloseTo(SCALE, 9)
        expect(result.shift).toBeCloseTo(SHIFT, 6)
        expect(result.matched).toBe(reference.length)
    })

    it('holds where the copies differ in holes and measure with noise', () => {
        const random = generator(7)
        const jittered = copy
            .filter(() => random() > 0.05)
            .map(note => ({ ...note, from: note.from + (random() - 0.5) * 0.8 }))
        const strays = Array.from({ length: 15 }, () => {
            const from = onCopy(200 + random() * 6000)
            return { pitch: 36 + Math.floor(random() * 60), from, to: from + 10 }
        })
        const [long] = [...copy].sort((x, y) => (y.to - y.from) - (x.to - x.from))
        const halves = [{ ...long, to: (long.from + long.to) / 2 }, { ...long, from: (long.from + long.to) / 2 + 2 }]
        const sweep = Array.from({ length: 80 }, (_, i) => ({ pitch: 24 + i, from: 7000 + i * 2, to: 7000.5 + i * 2 }))

        const result = alignFeatures(roll([...jittered, ...strays, ...halves, ...sweep]), roll(reference))!
        expect(result.scale).toBeCloseTo(SCALE, 3)
        expect(Math.abs(result.shift - SHIFT)).toBeLessThan(0.5)
        expect(result.matched).toBeGreaterThan(reference.length * 0.9)
        expect(result.residual).toBeLessThan(0.6)
    })

    it('follows the greater part of a copy that retimes a passage', () => {
        const retimed = copy.map((note, i) => {
            const stretched = i >= 100 && i < 130
            const delay = i >= 130 ? 20 : stretched ? (i - 100) / 30 * 20 : 0
            return { ...note, from: note.from + delay, to: note.to + delay }
        })
        const result = alignFeatures(roll(retimed), roll(reference))!
        expect(result.scale).toBeCloseTo(SCALE, 3)
        expect(Math.abs(result.shift - (SHIFT - 20))).toBeLessThan(1)
        expect(result.matched).toBeGreaterThan(reference.length * 0.5)
    })

    it('reads nothing but the notes the bar sounds', () => {
        const valves = [hole(2, -500, -495), hole(93, -400, -394), hole(4, 1000, 1005), hole(97, 3000, 3006)]
        const result = alignFeatures(roll(copy).concat(valves), roll(reference))!
        expect(result.scale).toBeCloseTo(SCALE, 9)
        expect(result.matched).toBe(reference.length)
    })

    it('reads the notes through the bar it is given', () => {
        const otherBar = { ...welteT100, meaningOf: () => undefined }
        expect(alignFeatures(roll(copy), roll(reference), otherBar)).toBeUndefined()
    })

    it('finds nothing between two different pieces', () => {
        expect(alignFeatures(roll(asCopy(piece(2))), roll(reference))).toBeUndefined()
    })

    it('finds nothing on a copy too short for a run of pitches', () => {
        expect(alignFeatures(roll(copy.slice(0, 3)), roll(reference))).toBeUndefined()
    })
})
