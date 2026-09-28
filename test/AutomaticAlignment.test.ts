import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition, referenceCopyOf } from '../src/model/Edition'
import { featuresOf, RollCopy } from '../src/model/RollCopy'
import { alignCopies, alignCopy, alignmentFor, chooseReferenceCopy, removeCopy, unalignCopy } from '../src/ops'
import { ALIGNMENT_METHOD, fromAxis, ownFeaturesOf, toAxis } from '../src/collation/alignment'
import { mm } from '../src/model/Quantity'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { editionOf } from './editionFixture'
import { copyOfPiece, piece } from './pieceFixture'

const notes = piece(1)

/** The reference copy at the piece's places, a red copy a little stretched and further on, and a Licensee re-cut. */
const edition = (): Edition => {
    const reference = copyOfPiece('reference', notes)
    const red = copyOfPiece('red', notes, { shift: 92.5, scale: 0.998 })
    const licensee = copyOfPiece('licensee', notes, { shift: 758, scale: 1.3, bar: welteLicensee })
    return { ...editionOf([reference, red, licensee], []), referenceCopy: 'reference' }
}

const copyIn = (edition: Edition, id: string): RollCopy => edition.copies.find(copy => copy.id === id)!

/** How far the copy's notes lie from the piece's, at most. */
const offPiece = (copy: RollCopy): number =>
    Math.max(...featuresOf(copy).map((feature, i) => Math.abs(feature.horizontal.from - notes[i].from)))

const date = new Date(2026, 8, 28)

describe('aligning a copy with the reference copy', () => {
    const aligned = () => produce(edition(), alignCopy('licensee', date))

    it('puts its notes onto the reference copy\'s, whatever system it was cut for', () => {
        expect(offPiece(copyIn(aligned(), 'licensee'))).toBeLessThan(1e-6)
    })

    it('records what it found, what against, how well, and how', () => {
        const alignment = copyIn(aligned(), 'licensee').measurements.alignment!
        expect(alignment.against).toBe('reference')
        expect(alignment.scale).toBeCloseTo(1.3, 9)
        expect(alignment.shift.horizontal).toBeCloseTo(758, 6)
        expect(alignment.shift.vertical).toBe(0)
        expect(alignment.matched).toBe(notes.length)
        expect(alignment.residual).toBeCloseTo(0, 6)
        expect(alignment.scaleError).toBeCloseTo(0, 9)
        expect(alignment.foundBy).toEqual({ ...ALIGNMENT_METHOD, date })
    })

    it('finds the same again, taking the copy off its earlier alignment first', () => {
        const again = produce(aligned(), alignCopy('licensee', date))
        expect(copyIn(again, 'licensee')).toEqual(copyIn(aligned(), 'licensee'))
    })

    it('leaves the reference copy as it is, its places being the axis', () => {
        const before = edition()
        expect(produce(before, alignCopy('reference', date))).toBe(before)
    })

    it('leaves a copy that shares no run of notes with the reference copy as it is', () => {
        const before = { ...edition(), copies: [...edition().copies, copyOfPiece('other', piece(2))] }
        expect(produce(before, alignCopy('other', date))).toBe(before)
    })

    it('reads a copy at its own places whatever alignment it has', () => {
        const copy = copyIn(aligned(), 'licensee')
        expect(ownFeaturesOf(copy)[5].horizontal.from).toBeCloseTo(featuresOf(copyIn(edition(), 'licensee'))[5].horizontal.from, 9)
        expect(alignmentFor(aligned(), copy, date)).toEqual(copy.measurements.alignment)
    })

    it('leaves a copy that was never aligned as it is when unaligning', () => {
        const before = edition()
        expect(produce(before, unalignCopy('licensee'))).toBe(before)
    })

    it('is taken off again by unaligning', () => {
        const back = produce(aligned(), unalignCopy('licensee'))
        const own = featuresOf(copyIn(edition(), 'licensee'))
        featuresOf(copyIn(back, 'licensee')).forEach((feature, i) =>
            expect(feature.horizontal.from).toBeCloseTo(own[i].horizontal.from, 9))
        expect(copyIn(back, 'licensee').measurements.alignment).toBeUndefined()
    })
})

describe('aligning every copy', () => {
    it('aligns each with the reference copy', () => {
        const next = produce(edition(), alignCopies(date))
        expect(offPiece(copyIn(next, 'red'))).toBeLessThan(1e-6)
        expect(offPiece(copyIn(next, 'licensee'))).toBeLessThan(1e-6)
        expect(copyIn(next, 'reference').measurements.alignment).toBeUndefined()
    })
})

describe('choosing the reference copy', () => {
    const chosen = () => produce(produce(edition(), alignCopies(date)), chooseReferenceCopy('red', date))

    it('makes the chosen copy\'s own places the axis', () => {
        const next = chosen()
        expect(next.referenceCopy).toBe('red')
        expect(copyIn(next, 'red').measurements.alignment).toBeUndefined()
        const own = featuresOf(copyIn(edition(), 'red'))
        featuresOf(copyIn(next, 'red')).forEach((feature, i) =>
            expect(feature.horizontal.from).toBeCloseTo(own[i].horizontal.from, 9))
    })

    it('aligns the others onto it, the former reference copy among them', () => {
        const next = chosen()
        const former = copyIn(next, 'reference').measurements.alignment!
        expect(former.against).toBe('red')
        expect(former.scale).toBeCloseTo(1 / 0.998, 9)

        const red = featuresOf(copyIn(next, 'red'))
        featuresOf(copyIn(next, 'licensee')).forEach((feature, i) =>
            expect(feature.horizontal.from).toBeCloseTo(red[i].horizontal.from, 6))
    })

    it('leaves the edition as it is for a copy it does not have', () => {
        const before = edition()
        expect(produce(before, chooseReferenceCopy('nothing', date))).toBe(before)
    })
})

describe('the reference copy', () => {
    it('is the copy the edition names', () => {
        expect(referenceCopyOf(edition())?.id).toBe('reference')
    })

    it('is otherwise the first copy with features that is not aligned', () => {
        const unnamed = produce({ ...edition(), referenceCopy: undefined }, alignCopies(date))
        expect(referenceCopyOf(unnamed)?.id).toBe('reference')

        const reordered = produce(unnamed, draft => { draft.copies.reverse() })
        expect(referenceCopyOf(reordered)?.id).toBe('reference')
    })

    it('goes unnamed when its copy is taken out', () => {
        expect(produce(edition(), removeCopy('reference')).referenceCopy).toBeUndefined()
    })
})

describe('a place carried onto the axis and back', () => {
    const alignment = { shift: { horizontal: mm(758), vertical: 0 as never }, scale: 1.3 }

    it('is shifted and then scaled on the way there', () => {
        expect(toAxis(alignment)(mm(100))).toBeCloseTo(1115.4, 9)
    })

    it('comes back where it was', () => {
        expect(fromAxis(alignment)(toAxis(alignment)(mm(100)))).toBeCloseTo(100, 9)
    })

    it('stays where it is on a copy that is not aligned', () => {
        expect(toAxis(undefined)(mm(100))).toBe(100)
        expect(fromAxis(undefined)(mm(100))).toBe(100)
    })
})

describe('a copy cut for the T-98', () => {
    it('is aligned through its own bar', () => {
        const green = copyOfPiece('green', notes, { shift: 1010, scale: 1.2929, bar: welteT98 })
        const next = produce({ ...edition(), copies: [...edition().copies, green] }, alignCopy('green', date))
        expect(copyIn(next, 'green').measurements.alignment!.scale).toBeCloseTo(1.2929, 9)
    })
})
