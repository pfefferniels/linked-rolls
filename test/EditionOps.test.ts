import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Edit } from '../src/Edit'
import { AnySymbol, Note } from '../src/Symbol'
import { idOf, idsOf } from '../src/Assumption'
import { connectVersions, createVersion, detachVersion, mergeEdits, removeFeatures, splitEdit } from '../src/editionOps'
import { copy, edition, editionOf, expression, hole, note, version } from './editionFixture'

const viewOf = (edition: Edition) => new EditionView(edition)
const noteIn = (edition: Edition) => viewOf(edition).get<Note>('note')!
const editsOf = (edition: Edition, versionId: string) => edition.versions.find(v => v.id === versionId)!.edits
const insertedIds = (edit: Edit) => edit.insert?.map(symbol => symbol.id) ?? []
const exchangeOf = (edit: Edit) => [insertedIds(edit), edit.delete ?? []]

const describeSymbol = (symbol: AnySymbol) =>
    symbol.type === 'note' ? `note ${symbol.pitch}` : symbol.type === 'expression' ? symbol.expressionType : symbol.text

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

describe('connecting a version to another', () => {
    /** A and B, each on a copy of its own, agreeing on the note within tolerance and on nothing else. */
    const twoRoots = () => editionOf(
        [
            copy('first', [
                hole('hole-note', 1000, 1010, 47),
                hole('hole-other-note', 1020, 1030, 49),
                hole('hole-on', 990, 992, 95)
            ]),
            copy('second', [
                hole('hole-note-second', 1002, 1011, 47),
                hole('hole-extra', 2000, 2010, 51)
            ])
        ],
        [
            version('A', [{
                type: 'edit',
                id: 'edit-a',
                insert: [
                    note('note', 60, 'hole-note'),
                    note('other-note', 62, 'hole-other-note'),
                    expression('forzando-on', 'ForzandoOn', 'hole-on')
                ]
            }]),
            version('B', [{
                type: 'edit',
                id: 'edit-b',
                insert: [note('note-b', 60, 'hole-note-second'), note('extra', 64, 'hole-extra')]
            }])
        ]
    )

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
