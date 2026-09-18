import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Edit } from '../src/Edit'
import { Note } from '../src/Symbol'
import { admits, CollationTolerance, isCollatable, isCollationsOwn } from '../src/Collation'
import { connectVersions } from '../src/editionOps'
import { idsOf } from '../src/Assumption'
import { mm } from '../src/Quantity'
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

    it('claims a bare insertion, a bare deletion and an equivalence between two spellings', () => {
        expect(isCollationsOwn(bare('a'))).toBe(true)
        expect(isCollationsOwn({ type: 'edit', id: 'b', delete: ['n'] })).toBe(true)
        expect(isCollationsOwn({ ...bare('c'), editType: 'replace-with-equivalent' })).toBe(true)
    })

    it('leaves alone an edit that says what the change is, why it was made, or what it rests on', () => {
        expect(isCollationsOwn({ ...bare('a'), editType: 'shift' })).toBe(false)
        expect(isCollationsOwn({ ...bare('b'), motivation: 'a pencil mark' })).toBe(false)
        expect(isCollationsOwn({
            ...bare('c'),
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
                editType: 'correct-error',
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
        return produce(before, connectVersions(new EditionView(before), 'B', 'A'))
    }

    it('keeps the edit the editor established, with its identifier and everything on it', () => {
        const kept = editsIn(connected(), 'B').find(edit => edit.id === 'established')!

        expect(kept.editType).toBe('correct-error')
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
        expect(idsOf(new EditionView(next).get<Note>('shared')!.carriers))
            .toEqual(['hole-shared', 'hole-shared-too'])
    })

    it('leaves the text of the child as it was', () => {
        expect(new EditionView(connected()).snapshot('B').map(symbol => symbol.id).sort())
            .toEqual(['own', 'shared'])
    })
})
