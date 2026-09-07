import { describe, expect, it } from 'vitest'
import { readFromSpencerBar, SPENCER_ROWS_PER_INCH } from '../src/readers/spencerBar'
import { asSymbols, unreadTracks } from '../src/RollCopy'
import { Expression, Note } from '../src/Symbol'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'

const leb128 = (value: number): number[] =>
    value < 128 ? [value] : [(value % 128) | 0x80, ...leb128(Math.floor(value / 128))]

/** A file as Spencer's software writes it, from (distance, position) events. */
const spencerBar = (events: [number, number][], text = '/oldtrackname:Test roll'): ArrayBuffer =>
    Uint8Array.from([
        0, 1, 0, 0, 0xF4,
        ...Buffer.from(text, 'latin1'), 0,
        ...events.flatMap(([distance, position]) => [...leb128(distance), position]),
        0, 0xFF
    ]).buffer

/**
 * The opening of a roll in Licensee positions: a mezzoforte and a soft
 * pedal command on the bass controls, the lowest and the highest note,
 * a note that overlaps a forzando, and a sustain pedal command on the
 * treble side.
 */
const events: [number, number][] = [
    [1380, 2], [913, 2],
    [1200, 8], [109, 8],
    [400, 9], [50, 9],
    [10, 88], [50, 88],
    [26, 45], [7, 5], [34, 5], [60, 45],
    [300, 91], [40, 91]
]

const MM_PER_INCH = 25.4

describe('reading a Spencer e-roll file', () => {
    const copy = readFromSpencerBar(spencerBar(events))

    it('pairs the events of a position into holes', () => {
        expect(copy.features).toHaveLength(7)
        expect(copy.features.every(feature => feature.type === 'Hole')).toBe(true)
    })

    it('places the holes at 400 rows to the inch', () => {
        const [first] = copy.features
        expect(SPENCER_ROWS_PER_INCH).toEqual(400)
        expect(first.horizontal.from).toBeCloseTo(1380 / 400 * MM_PER_INCH, 9)
        expect(first.horizontal.to).toBeCloseTo((1380 + 913) / 400 * MM_PER_INCH, 9)
    })

    it('orders the holes by their beginning', () => {
        const starts = copy.features.map(feature => feature.horizontal.from)
        expect(starts).toEqual([...starts].sort((a, b) => a - b))
    })

    it('keeps a hole open across the events of other positions', () => {
        const note = copy.features.find(feature => feature.vertical.from === 47)!
        const forzando = copy.features.find(feature => feature.vertical.from === 5)!
        expect(note.horizontal.from).toBeLessThan(forzando.horizontal.from)
        expect(note.horizontal.to).toBeGreaterThan(forzando.horizontal.to)
    })

    it('leaves no hole on a position the bar cannot read', () => {
        expect([...unreadTracks(copy.features).keys()]).toEqual([])
    })

    /**
     * The Licensee bar has no motor tracks, so its note block begins
     * two tracks below the T-100's while the bass controls coincide.
     */
    it('puts the Licensee positions onto the T-100 bar', () => {
        const symbols = asSymbols(copy.features)
        const pitches = symbols.filter((symbol): symbol is Note => symbol.type === 'note').map(symbol => symbol.pitch)
        expect(pitches).toEqual([24, 103, 60])

        const expressions = symbols
            .filter((symbol): symbol is Expression => symbol.type === 'expression')
            .map(symbol => `${symbol.scope} ${symbol.expressionType}`)
        expect(expressions).toEqual(['bass MezzoforteOn', 'bass SoftPedalOn', 'bass ForzandoOff', 'treble SustainPedalOn'])
    })

    it('names the Licensee as the system the copy was cut for', () => {
        expect(copy.production?.system).toEqual({
            id: 'https://w3id.org/reo/type/system/welte-licensee',
            name: welteLicensee.name,
            sameAs: []
        })
    })

    it('takes another resolution and another system', () => {
        const other = readFromSpencerBar(spencerBar(events), { rowsPerInch: 200, system: welteT100 })
        expect(other.features[0].horizontal.from).toBeCloseTo(copy.features[0].horizontal.from * 2, 9)
        expect(other.features.map(feature => feature.vertical.from)).toContain(9)
        expect(other.features.map(feature => feature.vertical.from)).not.toContain(11)
        expect(other.production?.system?.id).toEqual('https://w3id.org/reo/type/system/welte-t100')
    })

    it('leaves out a hole the edition’s bar does not read', () => {
        const ontoLicensee = readFromSpencerBar(
            spencerBar([[10, 9], [5, 9], [5, 45], [5, 45]]),
            { system: welteT100, bar: welteLicensee }
        )
        expect(ontoLicensee.features.map(feature => feature.vertical.from)).toEqual([43])
    })

    it('reads distances of more than one byte', () => {
        const far = readFromSpencerBar(spencerBar([[100000, 45], [5, 45]]))
        expect(far.features[0].horizontal.from).toBeCloseTo(100000 / 400 * MM_PER_INCH, 9)
    })

    it('rejects a file that is not one', () => {
        expect(() => readFromSpencerBar(Uint8Array.from([0, 1, 0, 0, 0x2F]).buffer)).toThrow(/Not a Spencer/)
        expect(() => readFromSpencerBar(new ArrayBuffer(2))).toThrow(/ends early/)
    })

    it('rejects a list that is cut off or leaves a hole open', () => {
        const cutOff = new Uint8Array(spencerBar(events)).slice(0, -2).buffer
        expect(() => readFromSpencerBar(cutOff)).toThrow(/ends early/)
        expect(() => readFromSpencerBar(spencerBar([[10, 45], [5, 46], [5, 45]]))).toThrow(/never end/)
    })
})
