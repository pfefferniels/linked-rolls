import { describe, expect, it } from 'vitest'
import { write } from 'midifile-ts'
import { CONTROL_OFFSET, readFromPhillipsEroll } from '../src/readers/phillipsEroll'
import { asSymbols, featuresOf, unreadTracks } from '../src/model/RollCopy'
import { Expression, Note } from '../src/model/Symbol'
import { TrackerBar } from '../src/systems/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { mm, seconds, track } from '../src/model/Quantity'

/** A perforation of the roll: the bar position it lies on, and its ticks. */
type Perforation = [position: number, from: number, to: number]

/**
 * The number he writes for a position: the pitch it sounds where it is
 * a note, else the position raised by the bar's control offset.
 */
const numberFor = (bar: TrackerBar, position: number): number => {
    const meaning = bar.meaningOf(track(position))
    return meaning?.type === 'note' ? meaning.pitch : position + CONTROL_OFFSET[bar.id]
}

/**
 * A file as his reader writes one: format 0, one track, every position
 * at one velocity, a single tempo.
 */
const eroll = (perforations: Perforation[], bar: TrackerBar = welteT100, ticksPerBeat = 384, microsecondsPerBeat = 600_000) => {
    const events = perforations
        .flatMap(([position, from, to]) => [
            { at: from, noteNumber: numberFor(bar, position), on: true },
            { at: to, noteNumber: numberFor(bar, position), on: false }
        ])
        .sort((a, b) => a.at - b.at)

    let last = 0
    const track = [
        { deltaTime: 0, type: 'meta', subtype: 'setTempo', microsecondsPerBeat },
        ...events.map(event => {
            const deltaTime = event.at - last
            last = event.at
            return {
                deltaTime,
                type: 'channel',
                subtype: event.on ? 'noteOn' : 'noteOff',
                channel: 0,
                noteNumber: event.noteNumber,
                velocity: event.on ? 64 : 0
            }
        }),
        { deltaTime: 0, type: 'meta', subtype: 'endOfTrack' }
    ]
    const bytes = write([track as never], ticksPerBeat)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Ticks the paper needs to run a millimetre, at 384 to the beat, 100 bpm and 3 m/min. */
const TICKS_PER_MM = 384 / (600_000 / 1_000_000) / (3000 / 60)

/**
 * The opening of a roll in T-100 positions: a mezzoforte on the bass
 * controls, the lowest and the highest note, a note overlapping a
 * forzando, and the sustain pedal on the treble side.
 */
const perforations: Perforation[] = [
    [2, 100, 130],
    [11, 200, 320],
    [90, 210, 300],
    [45, 400, 700], [6, 430, 460],
    [93, 800, 830]
]

describe('reading one of Phillips’s e-roll files', () => {
    const copy = readFromPhillipsEroll(eroll(perforations))

    it('reads every perforation as a hole', () => {
        expect(featuresOf(copy)).toHaveLength(perforations.length)
        expect(featuresOf(copy).every(feature => feature.type === 'HoleChain')).toBe(true)
    })

    it('puts a position where the bar has it, counting from one', () => {
        expect(featuresOf(copy).map(feature => feature.vertical.from).sort((a, b) => a - b))
            .toEqual([2, 6, 11, 45, 90, 93])
    })

    it('leaves no hole on a track the bar does not read', () => {
        expect(unreadTracks(featuresOf(copy), welteT100).size).toBe(0)
    })

    it('turns elapsed time into paper at the speed the system states', () => {
        const [first] = featuresOf(copy).sort((a, b) => a.horizontal.from - b.horizontal.from)
        expect(first.horizontal.from).toBeCloseTo(100 / TICKS_PER_MM, 6)
        expect(first.horizontal.to).toBeCloseTo(130 / TICKS_PER_MM, 6)
    })

    it('orders the holes by their beginning', () => {
        const starts = featuresOf(copy).map(feature => feature.horizontal.from)
        expect(starts).toEqual([...starts].sort((a, b) => a - b))
    })

    it('reads the expression positions, not only the notes', () => {
        const symbols = asSymbols(featuresOf(copy), welteT100)
        const expressions = symbols.filter((symbol): symbol is Expression => symbol.type === 'expression')
        expect(expressions.map(expression => expression.expressionType).sort())
            .toEqual(['ForzandoOn', 'MezzoforteOn', 'SustainPedalOn'])
    })

    it('sounds the notes as he does, since he numbers them by pitch', () => {
        const notes = asSymbols(featuresOf(copy), welteT100).filter((symbol): symbol is Note => symbol.type === 'note')
        expect(notes.map(note => note.pitch).sort((a, b) => a - b)).toEqual([24, 58, 103])
    })

    it('states that the features were read on a roll reader', () => {
        expect(copy.readFrom?.kind).toBe('reading')
        expect(copy.readFrom?.actor?.name).toBe('Phillips, Peter')
    })

    it('records the system the file numbers its positions by', () => {
        expect(copy.production?.system?.id).toContain('welte-t100')
    })
})

describe('reading a Licensee e-roll on the Licensee bar', () => {
    /** Sustain on and off, and the lowest note, in Licensee positions. */
    const licensee: Perforation[] = [[91, 100, 130], [92, 300, 330], [9, 500, 600]]
    const copy = readFromPhillipsEroll(eroll(licensee, welteLicensee), {
        system: welteLicensee,
        placeAt: elapsed => mm(elapsed * 50)
    })

    it('keeps the Licensee positions and reads them as that bar does', () => {
        const symbols = asSymbols(featuresOf(copy), welteLicensee)
        expect(symbols.filter(symbol => symbol.type === 'expression').map(s => (s as Expression).expressionType).sort())
            .toEqual(['SustainPedalOff', 'SustainPedalOn'])
        expect(featuresOf(copy).map(feature => feature.vertical.from).sort((a, b) => a - b))
            .toEqual([9, 91, 92])
    })

    it('needs a placeAt, the Licensee stating no speed of its own', () => {
        expect(() => readFromPhillipsEroll(eroll(licensee, welteLicensee), { system: welteLicensee }))
            .toThrowError(/paper speed/)
    })
})

describe('the options of the e-roll reader', () => {
    it('takes the place on the paper from placeAt where one is given', () => {
        const copy = readFromPhillipsEroll(eroll([[11, 0, 384]]), {
            placeAt: elapsed => mm(elapsed * 100)
        })
        const [hole] = featuresOf(copy)
        expect(hole.horizontal.from).toBeCloseTo(0, 9)
        expect(hole.horizontal.to).toBeCloseTo(60, 9)
    })

    it('follows a tempo change, a file written by hand having several', () => {
        const slow = readFromPhillipsEroll(eroll([[11, 0, 768]], welteT100, 384, 1_200_000), {
            placeAt: elapsed => mm(elapsed)
        })
        expect(featuresOf(slow)[0].horizontal.to).toBeCloseTo(seconds(2.4), 6)
    })

    it('takes a control offset of its own', () => {
        const copy = readFromPhillipsEroll(eroll([[6, 0, 100]]), { controlOffset: 14 })
        expect(featuresOf(copy)[0].vertical.from).toBe(6)
    })

    it('refuses a bar whose control offset nobody has measured', () => {
        const unknown = { ...welteT100, id: 'welte-green', name: 'Welte-Mignon T98' }
        expect(() => readFromPhillipsEroll(eroll([[11, 0, 100]]), { system: unknown }))
            .toThrowError(/control offset/)
    })
})
