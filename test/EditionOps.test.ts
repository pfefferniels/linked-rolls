import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView, Path } from '../src/EditionView'
import { Edit } from '../src/Edit'
import { AnySymbol, Expression, Note, placementsOf } from '../src/Symbol'
import { PaperStretch } from '../src/RollCopy'
import { constraintProblems } from '../src/constraints'
import { Assumption, assignObject, idOf, idsOf } from '../src/Assumption'
import {
    addReason, alignCopy, clearBelief, collateSymbols, connectVersions, createBelief, createVersion, deriveVersion,
    detachVersion, mergeEdits, pairPerforations, placePerforation, removeFeatures, removeReason, removeSymbols,
    removeVersion, setCertainty, splitEdit, unalignCopy, unpairPerforation, unplacePerforation
} from '../src/editionOps'
import { copy, edition, editionOf, expression, hole, note, version } from './editionFixture'
import { mm, track } from '../src/Quantity'

const viewOf = (edition: Edition) => new EditionView(edition)
const noteIn = (edition: Edition) => viewOf(edition).get<Note>('note')!
const forzandoOffIn = (edition: Edition) => viewOf(edition).get<Expression>('forzando-off')!
const editsOf = (edition: Edition, versionId: string) => edition.versions.find(v => v.id === versionId)!.edits
const insertedIds = (edit: Edit) => edit.insert?.map(symbol => symbol.id) ?? []
const exchangeOf = (edit: Edit) => [insertedIds(edit), edit.delete ?? []]

const describeSymbol = (symbol: AnySymbol) =>
    symbol.type === 'note' ? `note ${symbol.pitch}` : symbol.type === 'expression' ? symbol.expressionType : symbol.text

/** Two copies: the first carries a note, a second note and a forzando on; the second a note within tolerance of the first's, and one more. */
const twoCopies = () => [
    copy('first', [
        hole('hole-note', 1000, 1010, 47),
        hole('hole-other-note', 1020, 1030, 49),
        hole('hole-on', 990, 992, 95)
    ]),
    copy('second', [
        hole('hole-note-second', 1002, 1011, 47),
        hole('hole-extra', 2000, 2010, 51)
    ])
]

const versionA = () => version('A', [{
    type: 'edit',
    id: 'edit-a',
    insert: [
        note('note', 60, 'hole-note'),
        note('other-note', 62, 'hole-other-note'),
        expression('forzando-on', 'ForzandoOn', 'hole-on')
    ]
}])

/** A and B, each on a copy of its own, agreeing on the note and on nothing else. */
const twoRoots = () => editionOf(twoCopies(), [
    versionA(),
    version('B', [{
        type: 'edit',
        id: 'edit-b',
        insert: [note('note-b', 60, 'hole-note-second'), note('extra', 64, 'hole-extra')]
    }])
])

/** B based on A, inserting on its own copy a note agreeing with A's and one more, each in an edit of its own. */
const derived = () => editionOf(twoCopies(), [
    versionA(),
    version('B', [
        { type: 'edit', id: 'edit-b1', insert: [note('note-b', 60, 'hole-note-second')] },
        { type: 'edit', id: 'edit-b2', insert: [note('extra', 64, 'hole-extra')] }
    ], 'A')
])

describe('creating a version from a copy', () => {
    it('adds the copy and a version inserting what the tracker bar reads on it', () => {
        const next = produce(editionOf([], []), createVersion('A', copy('first', [
            hole('hole-note', 1000, 1010, 47),
            hole('hole-on', 990, 992, 95),
            hole('hole-unread', 995, 996, 0)
        ])))
        const [created] = next.versions
        const inserted = created.edits.map(edit => edit.insert ?? [])

        expect(next.copies.map(c => c.id)).toEqual(['first'])
        expect(created.siglum).toBe('A')
        expect(created.basedOn).toBeUndefined()
        expect(inserted.map(symbols => symbols.length)).toEqual([1, 1])
        expect(inserted.flat().map(describeSymbol)).toEqual(['note 60', 'ForzandoOn'])
        expect(inserted.flat().map(symbol => idsOf(symbol.carriers))).toEqual([['hole-note'], ['hole-on']])
    })
})

describe('aligning a copy', () => {
    const stretch = assignObject<PaperStretch>({ type: 'ConditionState', conditionType: 'paper-stretch', factor: 1.5 })
    const shift = { horizontal: mm(2), vertical: track(1) }
    const holeOf = (edition: Edition) => edition.copies[1].features[0]

    it('shifts and then stretches its features, recording both', () => {
        const next = produce(edition(), alignCopy('second', shift, stretch))
        const aligned = next.copies[1]

        expect(holeOf(next).horizontal).toEqual({ unit: 'mm', from: 1504.5, to: 1519.5 })
        expect(holeOf(next).vertical.from).toBe(48)
        expect(aligned.ops).toEqual(['shifted', 'stretched'])
        expect(aligned.measurements.shift).toEqual(shift)
        expect(aligned.conditions).toEqual([stretch])
    })

    it('is undone completely by unaligning', () => {
        const aligned = produce(edition(), alignCopy('second', shift, stretch))
        const next = produce(aligned, unalignCopy('second'))

        expect(holeOf(next).horizontal.from).toBeCloseTo(1001)
        expect(holeOf(next).horizontal.to).toBeCloseTo(1011)
        expect(holeOf(next).vertical.from).toBe(47)
        expect(next.copies[1].ops).toEqual([])
        expect(next.copies[1].measurements.shift).toBeUndefined()
        expect(next.copies[1].conditions).toEqual([])
    })

    it('leaves a copy that was never aligned as it is', () => {
        const before = edition()
        expect(produce(before, unalignCopy('second'))).toBe(before)
    })
})

describe('connecting a version to another', () => {
    it('bases the child on the parent, collating what matches and spelling out the difference', () => {
        const before = twoRoots()
        const next = produce(before, connectVersions(viewOf(before), 'B', 'A'))
        const child = next.versions[1]

        expect(idOf(child.basedOn!)).toBe('A')
        expect(idsOf(noteIn(next).carriers)).toEqual(['hole-note', 'hole-note-second'])
        expect(child.edits.map(exchangeOf)).toEqual([
            [['extra'], []],
            [[], ['forzando-on']],
            [[], ['other-note']]
        ])
        expect(viewOf(next).snapshot('B').map(symbol => symbol.id)).toEqual(['note', 'extra'])
    })

    it('leaves the edition as it is for a version it does not have', () => {
        const before = twoRoots()
        expect(produce(before, connectVersions(viewOf(before), 'nothing', 'A'))).toBe(before)
    })
})

describe('collating the symbols of a version into what it inherits', () => {
    it('hands the carriers over and drops the insertions that collated, with an edit left empty', () => {
        const before = derived()
        const next = produce(before, collateSymbols(viewOf(before), 'B', ['note-b', 'extra']))

        expect(idsOf(noteIn(next).carriers)).toEqual(['hole-note', 'hole-note-second'])
        expect(editsOf(next, 'B').map(edit => edit.id)).toEqual(['edit-b2'])
        expect(viewOf(next).snapshot('B').map(symbol => symbol.id)).toEqual(['forzando-on', 'note', 'other-note', 'extra'])
    })

    it('leaves the edition as it is where nothing collates, or for a version standing on its own', () => {
        const alone = derived()
        expect(produce(alone, collateSymbols(viewOf(alone), 'B', ['extra']))).toBe(alone)

        const roots = twoRoots()
        expect(produce(roots, collateSymbols(viewOf(roots), 'B', ['note-b']))).toBe(roots)
    })
})

describe('detaching a version', () => {
    it('spells out what it inherited as its own insertions and drops the link', () => {
        const before = edition()
        const next = produce(before, detachVersion(viewOf(before), 'B'))
        const detached = next.versions[1]

        expect(detached.basedOn).toBeUndefined()
        expect(detached.motivations).toEqual([])
        expect(detached.edits.map(insertedIds)).toEqual([['label'], ['note'], ['forzando-off'], ['other-note']])
        expect(viewOf(next).snapshot('B').map(symbol => symbol.id)).toEqual(['label', 'note', 'forzando-off', 'other-note'])
    })
})

describe('removing a version', () => {
    it('takes it out and lets what was based on it stand on its own', () => {
        const before = edition()
        const next = produce(before, removeVersion(viewOf(before), 'A'))
        const [remaining, ...rest] = next.versions

        expect(rest).toEqual([])
        expect(remaining.id).toBe('B')
        expect(remaining.basedOn).toBeUndefined()
        expect(remaining.edits.map(insertedIds)).toEqual([['label'], ['note'], ['forzando-off'], ['other-note']])
    })

    it('leaves the edition as it is for an unknown id', () => {
        const before = edition()
        expect(produce(before, removeVersion(viewOf(before), 'nothing'))).toBe(before)
    })
})

describe('removing symbols from a version', () => {
    it('takes them out of its insertions, and an edit left with nothing goes', () => {
        const next = produce(edition(), removeSymbols('A', ['other-note', 'label']))
        expect(editsOf(next, 'A').map(insertedIds)).toEqual([['note', 'forzando-off', 'forzando-on']])

        const emptied = produce(edition(), removeSymbols('A', ['note', 'other-note', 'forzando-off', 'forzando-on', 'label']))
        expect(editsOf(emptied, 'A')).toEqual([])
    })

    it('leaves what the version inherits alone', () => {
        const before = edition()
        expect(produce(before, removeSymbols('B', ['note']))).toBe(before)
    })
})

describe('removing features from a copy', () => {
    it('strips the carrier and keeps a symbol another feature still carries', () => {
        const next = produce(edition(), removeFeatures('second', ['hole-note-second']))

        expect(next.copies[1].features).toEqual([])
        expect(idsOf(noteIn(next).carriers)).toEqual(['hole-note'])
        expect(insertedIds(next.versions[0].edits[0])).toEqual(['note', 'other-note', 'forzando-off', 'forzando-on', 'label'])
    })

    it('takes a symbol with its last carrier, and every reference to it', () => {
        const next = produce(edition(), removeFeatures('first', ['hole-other-note', 'hole-on']))

        expect(next.copies[0].features.map(feature => feature.id)).toEqual(['hole-note', 'hole-off'])
        expect(insertedIds(next.versions[0].edits[0])).toEqual(['note', 'forzando-off', 'label'])
        expect('alignedWith' in noteIn(next)).toBe(false)
        expect('pairedWith' in noteIn(next)).toBe(false)
        expect(next.versions[1].edits).toEqual([])
    })

    it('touches nothing else', () => {
        const before = edition()
        const next = produce(before, removeFeatures('second', ['hole-note-second']))

        expect(next.copies[0]).toBe(before.copies[0])
        expect(next.versions[1]).toBe(before.versions[1])
        expect(next.versions[0].edits[0].insert![1]).toBe(before.versions[0].edits[0].insert![1])
    })

    it('leaves the edition as it is for an unknown copy', () => {
        const before = edition()
        expect(produce(before, removeFeatures('nothing', ['hole-note']))).toBe(before)
    })
})

/**
 * Version A of the fixture on its copy, with spare holes for the
 * symbols an edit may put in place of its own, and a version C based
 * on it that carries the given edits plus one that stays out of the way.
 */
const withC = (edits: Edit[]) => editionOf(
    [copy('first', [
        hole('hole-note', 1000, 1010, 47),
        hole('hole-other-note', 1020, 1030, 49),
        hole('hole-off', 1004, 1006, 96),
        hole('hole-on', 990, 992, 95),
        hole('hole-short', 1000, 1005, 47),
        hole('hole-long', 1000, 1015, 47),
        hole('hole-far', 1500, 1510, 47),
        hole('hole-on-2', 1100, 1102, 95),
        hole('hole-off-2', 1114, 1116, 96)
    ])],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                note('note', 60, 'hole-note'),
                note('other-note', 62, 'hole-other-note'),
                expression('forzando-off', 'ForzandoOff', 'hole-off'),
                expression('forzando-on', 'ForzandoOn', 'hole-on')
            ]
        }]),
        version('C', [...edits, { type: 'edit', id: 'edit-aside', delete: ['other-note'] }], 'A')
    ]
)

const noteShort = note('note-short', 60, 'hole-short')
const noteLong = note('note-long', 60, 'hole-long')
const noteFar = note('note-far', 60, 'hole-far')
const on2 = expression('on-2', 'ForzandoOn', 'hole-on-2')
const off2 = expression('off-2', 'ForzandoOff', 'hole-off-2')

const inserting = (id: string, ...symbols: AnySymbol[]): Edit => ({ type: 'edit', id, insert: symbols })
const deleting = (id: string, ...symbolIds: string[]): Edit => ({ type: 'edit', id, delete: symbolIds })

describe('merging edits', () => {
    const mergedIn = (edits: Edit[]) => {
        const before = withC(edits)
        return editsOf(produce(before, mergeEdits(viewOf(before), 'C', edits)), 'C')
    }

    it('replaces the edits with one carrying all their insertions and deletions', () => {
        const [aside, merged, ...rest] = mergedIn([inserting('e1', noteShort), deleting('e2', 'note')])

        expect(rest).toEqual([])
        expect(aside.id).toBe('edit-aside')
        expect(exchangeOf(merged)).toEqual([['note-short'], ['note']])
        expect(['e1', 'e2']).not.toContain(merged.id)
    })

    it('classifies the merged edit by what it exchanges', () => {
        const typeOf = (edits: Edit[]) => mergedIn(edits).at(-1)!.editType

        expect(typeOf([inserting('e1', noteShort), deleting('e2', 'note')])).toBe('shorten')
        expect(typeOf([inserting('e1', noteLong), deleting('e2', 'note')])).toBe('prolong')
        expect(typeOf([inserting('e1', noteFar), deleting('e2', 'note')])).toBe('correct-error')
        expect(typeOf([inserting('e1', on2), inserting('e2', off2)])).toBe('additional-accent')
        expect(typeOf([inserting('e1', on2, off2), deleting('e2', 'forzando-on', 'forzando-off')])).toBe('shift')
        expect(typeOf([deleting('e1', 'forzando-on')])).toBe('remove-redundancy')
    })

    it('leaves the edition as it is with nothing to merge', () => {
        const before = withC([])
        expect(produce(before, mergeEdits(viewOf(before), 'C', []))).toBe(before)
    })
})

describe('splitting an edit', () => {
    it('replaces the edit with one per inserted and per deleted symbol', () => {
        const toSplit: Edit = { type: 'edit', id: 'edit-c', insert: [noteShort, on2], delete: ['note', 'forzando-on'] }
        const [aside, ...parts] = editsOf(produce(withC([toSplit]), splitEdit('C', toSplit)), 'C')

        expect(aside.id).toBe('edit-aside')
        expect(parts.map(exchangeOf)).toEqual([
            [['note-short'], []],
            [['on-2'], []],
            [[], ['note']],
            [[], ['forzando-on']]
        ])
        expect(parts.map(part => part.id)).not.toContain('edit-c')
    })
})

describe('deriving a version', () => {
    it('moves the edits into a new version based on this one', () => {
        const next = produce(withC([inserting('e1', noteShort), deleting('e2', 'note')]), deriveVersion('C', ['e1']))
        const created = next.versions[2]

        expect(editsOf(next, 'C').map(edit => edit.id)).toEqual(['e2', 'edit-aside'])
        expect(idOf(created.basedOn!)).toBe('C')
        expect(created.versionType).toBe('unicum')
        expect(created.siglum).toBe('C_derived')
        expect(created.edits.map(edit => edit.id)).toEqual(['e1'])
    })
})

describe('placing and pairing perforations', () => {
    it('states the placement on the follower where it was inserted', () => {
        const before = edition()
        const next = produce(before, placePerforation(viewOf(before), 'forzando-off', 'note', 'alignedWith'))

        expect(next.versions[0].edits[0].insert?.find(symbol => symbol.id === 'forzando-off'))
            .toMatchObject({ alignedWith: { id: 'note' } })
        expect(placementsOf(forzandoOffIn(next))).toEqual([{ relation: 'alignedWith', reference: { id: 'note' } }])
    })

    it('places one way at most, a new statement taking the place of the old', () => {
        const before = edition()
        const view = viewOf(before)
        const placed = produce(before, placePerforation(view, 'forzando-off', 'note', 'before'))
        const next = produce(placed, placePerforation(view, 'forzando-off', 'other-note', 'after'))

        expect(placementsOf(forzandoOffIn(next))).toEqual([{ relation: 'after', reference: { id: 'other-note' } }])
        expect('before' in forzandoOffIn(next)).toBe(false)
    })

    it('takes a placement back without leaving a key behind', () => {
        const before = edition()
        const view = viewOf(before)
        const placed = produce(before, placePerforation(view, 'forzando-off', 'note', 'before'))
        const next = produce(placed, unplacePerforation(view, 'forzando-off'))

        expect(placementsOf(forzandoOffIn(next))).toEqual([])
        expect('before' in forzandoOffIn(next)).toBe(false)
    })

    it('states a pair on one side only, and takes it back from that side', () => {
        const before = edition()
        const view = viewOf(before)
        const paired = produce(before, pairPerforations(view, 'forzando-off', 'forzando-on'))

        expect(forzandoOffIn(paired).pairedWith).toEqual({ id: 'forzando-on' })
        expect(viewOf(paired).get<Expression>('forzando-on')?.pairedWith).toBeUndefined()

        const next = produce(paired, unpairPerforation(view, 'forzando-off'))
        expect('pairedWith' in forzandoOffIn(next)).toBe(false)
    })

    it('leaves the edition as it is for a text symbol or an unknown id', () => {
        const before = edition()
        const view = viewOf(before)

        expect(produce(before, placePerforation(view, 'label', 'note', 'alignedWith'))).toBe(before)
        expect(produce(before, pairPerforations(view, 'nothing', 'note'))).toBe(before)
    })

    it('binds every version carrying the perforation, which the checks tell apart', () => {
        const before = edition()
        const next = produce(before, pairPerforations(viewOf(before), 'forzando-off', 'forzando-on'))

        expect(constraintProblems(viewOf(next)))
            .toContainEqual({ version: 'B', symbol: 'forzando-off', problem: 'partner-missing' })
    })
})

describe('believing an assumption', () => {
    const carrier: Path = ['versions', 0, 'edits', 0, 'insert', 0, 'carriers', 0]
    const beliefAt = (edition: Edition) => viewOf(edition).atPath<Assumption>(carrier)?.['@annotation']?.belief
    const reason = { type: 'simpleArgumentation' as const, note: 'seen on the roll', actor: { name: '', sameAs: [] } }

    it('annotates it with a belief held true, and clears it again', () => {
        const believed = produce(edition(), createBelief(carrier))
        expect(beliefAt(believed)).toMatchObject({ type: 'belief', certainty: 'true', reasons: [] })

        const cleared = produce(believed, clearBelief(carrier))
        expect('@annotation' in viewOf(cleared).atPath<Assumption>(carrier)!).toBe(false)
    })

    it('changes the certainty and keeps the reasons', () => {
        const believed = produce(edition(), createBelief(carrier))
        const reasoned = produce(believed, addReason(carrier, reason))
        const doubted = produce(reasoned, setCertainty(carrier, 'unlikely'))

        expect(beliefAt(doubted)).toMatchObject({ certainty: 'unlikely', reasons: [reason] })
        expect(beliefAt(produce(doubted, removeReason(carrier, 0)))?.reasons).toEqual([])
    })

    it('leaves the edition as it is where there is no belief to change, or nothing at the path', () => {
        const before = edition()
        expect(produce(before, setCertainty(carrier, 'false'))).toBe(before)
        expect(produce(before, createBelief(['versions', 9]))).toBe(before)
    })
})
