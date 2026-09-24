import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/model/Edition'
import { EditionView } from '../src/view/EditionView'
import { AnyFeature, isPlaced } from '../src/model/Feature'
import { revertShortening, shortenChains, tooShortToShorten } from '../src/collation/alignment'
import { shortenCopy, unshortenCopy } from '../src/ops'
import { mm } from '../src/model/Quantity'
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

const holeIn = (edition: Edition, id: string) => {
    const feature = new EditionView(edition).feature(id)
    if (!feature || !isPlaced(feature)) throw new Error(`no placed feature ${id}`)
    return feature
}
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
        expect(shortened().copies[0].measurements.readerExtension).toEqual({ length: 1.6 })
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
        expect(back.copies[0].measurements.readerExtension).toBeUndefined()
    })

    it('leaves a copy nothing was taken off alone', () => {
        const before = read()
        expect(produce(before, unshortenCopy('pneumatic'))).toBe(before)
    })
})

describe('a hole no longer than the extension', () => {
    const withAShortHole = (): Edition => editionOf(
        [copy('pneumatic', [hole('short', 100, 101.2, 47), hole('ordinary', 200, 240, 49)])],
        []
    )

    it('is named beforehand, rather than being made to end before it begins', () => {
        const tooShort = tooShortToShorten(mm(1.6), withAShortHole().copies[0])
        expect(tooShort.map(feature => feature.id)).toEqual(['short'])
    })

    it('stops the whole copy being shortened, the constant having reached its limit', () => {
        expect(() => shortenChains(mm(1.6), withAShortHole().copies[0])).toThrow(/short/)
    })

    it('leaves the copy untouched where it throws', () => {
        const copy = withAShortHole().copies[0]
        expect(() => shortenChains(mm(1.6), copy)).toThrow()
        expect(copy.measurements.readerExtension).toBeUndefined()
        expect(lengthOf({ ...withAShortHole(), copies: [copy] }, 'ordinary')).toBeCloseTo(40, 6)
    })

    it('names none where every hole is longer than the extension', () => {
        expect(tooShortToShorten(mm(1.1), withAShortHole().copies[0])).toEqual([])
    })

    it('is passed over where it is named, and does not block the rest', () => {
        const next = produce(withAShortHole(), shortenCopy('pneumatic', mm(1.6), new Set(['short'])))

        expect(lengthOf(next, 'short')).toBeCloseTo(1.2, 6)
        expect(lengthOf(next, 'ordinary')).toBeCloseTo(38.4, 6)
        expect(next.copies[0].measurements.readerExtension).toEqual({ length: 1.6, leaving: ['short'] })
    })

    /**
     * A hole nothing was taken off must not have anything put back, or
     * reverting would leave it longer than the reader ever gave it.
     */
    it('is left alone again when the extension is put back', () => {
        const next = produce(withAShortHole(), shortenCopy('pneumatic', mm(1.6), new Set(['short'])))
        const back = produce(next, unshortenCopy('pneumatic'))

        expect(lengthOf(back, 'short')).toBeCloseTo(1.2, 6)
        expect(lengthOf(back, 'ordinary')).toBeCloseTo(40, 6)
        expect(back.copies[0].measurements.readerExtension).toBeUndefined()
    })
})

describe('the functions the ops are built from', () => {
    it('shorten and revert a copy in place, as the alignment ones do', () => {
        const copy = read().copies[0]
        shortenChains(mm(2), copy)

        expect(copy.measurements.readerExtension).toEqual({ length: 2 })

        revertShortening(copy)
        expect(copy.measurements.readerExtension).toBeUndefined()
    })
})
