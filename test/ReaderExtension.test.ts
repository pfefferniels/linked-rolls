import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { AnyFeature } from '../src/Feature'
import { revertShortening, shortenHoles } from '../src/alignment'
import { shortenCopy, unshortenCopy } from '../src/editionOps'
import { mm } from '../src/Quantity'
import { alteration, copy, editionOf, hole } from './editionFixture'

/**
 * A copy read on a pneumatic reader: its holes run longer than the
 * perforations that caused them, by the same amount whatever their
 * length, since a valve is held on past the hole that opened it.
 */
const read = (): Edition => editionOf(
    [{
        ...copy('pneumatic', [hole('short', 100, 104.6, 47), hole('long', 200, 340.6, 49)]),
        modifications: [alteration({
            type: 'Writing',
            id: 'pencil',
            horizontal: { unit: 'mm', from: mm(500), to: mm(520) },
            vertical: { from: 0, unit: 'track' },
            text: 'WM 225'
        } as unknown as AnyFeature)]
    }],
    []
)

const holeIn = (edition: Edition, id: string) => new EditionView(edition).get<{ horizontal: { from: number, to: number } }>(id)!
const lengthOf = (edition: Edition, id: string) => holeIn(edition, id).horizontal.to - holeIn(edition, id).horizontal.from

describe('taking a pneumatic reader\'s extension off a copy', () => {
    const shortened = (): Edition => produce(read(), shortenCopy('pneumatic', mm(1.6)))

    it('takes the same amount off every hole, whatever its length', () => {
        expect(lengthOf(read(), 'short')).toBeCloseTo(4.6, 6)
        expect(lengthOf(read(), 'long')).toBeCloseTo(140.6, 6)
        expect(lengthOf(shortened(), 'short')).toBeCloseTo(3.0, 6)
        expect(lengthOf(shortened(), 'long')).toBeCloseTo(139.0, 6)
    })

    it('leaves the onsets where they were, the valve opening with the perforation', () => {
        expect(holeIn(shortened(), 'short').horizontal.from).toBe(100)
        expect(holeIn(shortened(), 'long').horizontal.from).toBe(200)
    })

    it('records what was taken, and that it was', () => {
        expect(shortened().copies[0].measurements.readerExtension).toBe(1.6)
        expect(shortened().copies[0].ops).toEqual(['shortened'])
    })

    it('leaves a writing alone, what it spans being no valve', () => {
        const pencil = holeIn(shortened(), 'pencil')
        expect(pencil.horizontal.to - pencil.horizontal.from).toBe(20)
    })

    it('does not take it off twice', () => {
        const twice = produce(shortened(), shortenCopy('pneumatic', mm(1.6)))
        expect(lengthOf(twice, 'short')).toBeCloseTo(3.0, 6)
    })

    it('puts it back, leaving the copy as it was read', () => {
        const back = produce(shortened(), unshortenCopy('pneumatic'))

        expect(lengthOf(back, 'short')).toBeCloseTo(4.6, 6)
        expect(lengthOf(back, 'long')).toBeCloseTo(140.6, 6)
        expect(back.copies[0].ops).toEqual([])
        expect(back.copies[0].measurements.readerExtension).toBeUndefined()
    })

    it('leaves a copy nothing was taken off alone', () => {
        const before = read()
        expect(produce(before, unshortenCopy('pneumatic'))).toBe(before)
    })
})

describe('the functions the ops are built from', () => {
    it('shorten and revert a copy in place, as the alignment ones do', () => {
        const copy = read().copies[0]
        shortenHoles(mm(2), copy)

        expect(copy.ops).toEqual(['shortened'])
        expect(copy.measurements.readerExtension).toBe(2)

        revertShortening(copy)
        expect(copy.ops).toEqual([])
    })
})
