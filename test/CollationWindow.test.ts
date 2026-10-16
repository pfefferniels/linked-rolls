import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/model/Edition'
import { snapshotOf } from '../src/analysis/text'
import { symbolIn } from '../src/lookup/lookup'
import { Edit, musicalChange, technicalChange } from '../src/model/Edit'
import { admits, CollationTolerance, isCollatable, isCollationsOwn } from '../src/collation/Collation'
import { connectVersions } from '../src/ops'
import { idsOf } from '../src/model/Assumption'
import { mm } from '../src/model/Quantity'
import { copy, editionOf, hole, note, version } from './editionFixture'

const tight: CollationTolerance = { toleranceStart: mm(1), toleranceEnd: mm(1) }
const shifted: CollationTolerance = { ...tight, offsetStart: mm(5), offsetEnd: mm(5) }

describe('the window two readings must fall in', () => {
    it('is centred on nothing where it names no offset, as every window written before was', () => {
        expect(admits(tight, { from: mm(0.5), to: mm(-0.5) })).toBe(true)
        expect(admits(tight, { from: mm(5), to: mm(5) })).toBe(false)
    })

    it('is centred on the offset where it names one', () => {
        expect(admits(shifted, { from: mm(5), to: mm(5) })).toBe(true)
        expect(admits(shifted, { from: mm(0), to: mm(0) })).toBe(false)
        expect(admits(shifted, { from: mm(6), to: mm(4) })).toBe(true)
        expect(admits(shifted, { from: mm(6.5), to: mm(5) })).toBe(false)
    })

    it('takes the two ends apart', () => {
        const uneven: CollationTolerance = { toleranceStart: mm(1), toleranceEnd: mm(4) }
        expect(admits(uneven, { from: mm(0.5), to: mm(3) })).toBe(true)
        expect(admits(uneven, { from: mm(3), to: mm(0.5) })).toBe(false)
    })
})

describe('collating two symbols the copies put apart', () => {
    const here = note('here', 60, 'hole-here')
    const there = note('there', 60, 'hole-there')
    const locate = (symbol: { id: string }) =>
        symbol.id === 'here'
            ? { unit: 'mm' as const, from: mm(1005), to: mm(1015) }
            : { unit: 'mm' as const, from: mm(1000), to: mm(1010) }

    it('leaves them apart at a tight window centred on nothing', () => {
        expect(isCollatable(here, there, locate, tight)).toBe(false)
    })

    /**
     * The systematic offset between two copies is not scatter. Centring
     * the window on it lets the tolerance stand for the scatter alone,
     * where otherwise it has to be widened by the whole of the offset.
     */
    it('joins them at the same tolerance once the window is centred on the offset', () => {
        expect(isCollatable(here, there, locate, shifted)).toBe(true)
    })
})

describe('which edits a collation may rewrite', () => {
    const bare = (id: string): Edit => ({ type: 'edit', id, insert: [note('n', 60)] })

    it('claims an edit that says nothing of why it was made, however it is grouped', () => {
        expect(isCollationsOwn(bare('a'))).toBe(true)
        expect(isCollationsOwn({ type: 'edit', id: 'b', delete: ['n'] })).toBe(true)
        expect(isCollationsOwn({ ...bare('c'), delete: ['m'] })).toBe(true)
    })

    /**
     * A program states the kind of every change it draws, with the
     * generic motivation of a musical or a technical change. That must not make it the editor's, or the next
     * collation would freeze against its own previous output.
     */
    it('claims one that says only that it is a musical or a technical change, which is not somebody having said why', () => {
        expect(isCollationsOwn({ ...bare('a'), motivation: musicalChange })).toBe(true)
        expect(isCollationsOwn({ ...bare('a'), motivation: technicalChange })).toBe(true)
    })

    it('leaves alone an edit that says why it was made, or what it rests on', () => {
        expect(isCollationsOwn({ ...bare('b'), motivation: 'a pencil mark' })).toBe(false)
        expect(isCollationsOwn({
            ...bare('e'),
            '@annotation': { id: 'x', belief: { type: 'belief', id: 'y', certainty: 'likely', reasons: [] } }
        })).toBe(false)
    })
})

/**
 * Two versions standing on their own. Both carry a note at the same
 * place, and the child states a reading of its own beside it: a note it
 * holds to correct an error, stated as an edit with a motivation.
 */
const twoRootsWithAReading = (): Edition => editionOf(
    [
        copy('first', [hole('hole-shared', 1000, 1010, 47)]),
        copy('second', [hole('hole-shared-too', 1001, 1011, 47), hole('hole-own', 2000, 2010, 49)])
    ],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('shared', 60, 'hole-shared')] }]),
        version('B', [
            { type: 'edit', id: 'bare', insert: [note('shared-too', 60, 'hole-shared-too')] },
            {
                type: 'edit',
                id: 'established',
                motivation: 'the copy reads the tone a step higher',
                insert: [note('own', 62, 'hole-own')]
            }
        ])
    ]
)

const editsIn = (edition: Edition, versionId: string) => edition.versions.find(v => v.id === versionId)!.edits!

describe('connecting two versions where an editor has already read the difference', () => {
    const connected = () => {
        const before = twoRootsWithAReading()
        return produce(before, connectVersions('B', 'A'))
    }

    it('keeps the edit the editor established, with its identifier and everything on it', () => {
        const kept = editsIn(connected(), 'B').find(edit => edit.id === 'established')!

        expect(kept.motivation).toBe('the copy reads the tone a step higher')
        expect(kept.insert!.map(symbol => symbol.id)).toEqual(['own'])
    })

    it('does not state a second time what that edit already inserts', () => {
        const inserting = editsIn(connected(), 'B').filter(edit => (edit.insert ?? []).some(s => s.id === 'own'))
        expect(inserting.length).toBe(1)
    })

    it('rewrites the bare insertion, collating the note away and handing its carriers over', () => {
        const next = connected()

        expect(editsIn(next, 'B').map(edit => edit.id)).not.toContain('bare')
        expect(idsOf(symbolIn(next, 'shared')!.carriers))
            .toEqual(['hole-shared', 'hole-shared-too'])
    })

    it('leaves the text of the child as it was', () => {
        expect(snapshotOf(connected(), 'B').map(symbol => symbol.id).sort())
            .toEqual(['own', 'shared'])
    })

})

/** Two roots with a reading each that the other lacks, so a collation has something to state. */
const twoRootsApart = (): Edition => editionOf(
    [
        copy('first', [hole('hole-gone', 1000, 1010, 47)]),
        copy('second', [hole('hole-new', 5000, 5010, 49)])
    ],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('gone', 60, 'hole-gone')] }]),
        version('B', [{ type: 'edit', id: 'edit-b', insert: [note('new', 62, 'hole-new')] }])
    ]
)

describe('what a collation says about the edits it makes', () => {
    const connected = () => {
        const before = twoRootsApart()
        return produce(before, connectVersions('B', 'A'))
    }

    it('calls a change of a note a musical one, whose reason nobody has given', () => {
        const next = connected()

        expect(editsIn(next, 'B').length).toBe(2)
        expect(editsIn(next, 'B').every(edit => edit.motivation === musicalChange)).toBe(true)
        expect(next.motivations).toBeUndefined()
    })

    /**
     * The generic motivation says a rule made the edit and nobody has
     * said why. It must not read as somebody having weighed it, or the
     * next collation would freeze against its own previous output.
     */
    it('rewrites what it marked before, rather than freezing against its own output', () => {
        const once = connected()
        const twice = produce(once, connectVersions('B', 'A'))

        expect(editsIn(twice, 'B').map(edit => edit.id)).not.toEqual(editsIn(once, 'B').map(edit => edit.id))
        expect(snapshotOf(twice, 'B').map(symbol => symbol.id)).toEqual(['new'])
    })

    it('declares no motivation of the edition\'s, however often it collates', () => {
        const once = connected()
        const twice = produce(once, connectVersions('B', 'A'))

        expect(twice.motivations).toBeUndefined()
    })
})
