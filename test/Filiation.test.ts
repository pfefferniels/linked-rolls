import { describe, expect, it } from 'vitest'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { Belief } from '../src/model/Assumption'
import { Edit } from '../src/model/Edit'
import { Edition } from '../src/model/Edition'
import { Version } from '../src/model/Version'
import { bearingsOf, editTypesOf, filiationProblems, restorationsOf } from '../src/analysis/filiation'

const insert = (id: string, ...symbols: Edit['insert'] & {}): Edit => ({ type: 'edit', id, insert: symbols })
const strike = (id: string, ...symbols: string[]): Edit => ({ type: 'edit', id, delete: symbols })

/**
 * A, the root, on both copies; B and C each derived from A, B on the
 * first copy and C on the second. What each inserts its own copy alone
 * carries.
 */
const branches = (): Edition => editionOf(
    [
        copy('first', [hole('hole-a1', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49)]),
        copy('second', [hole('hole-a2', 1000, 1010, 47), hole('hole-c', 1200, 1210, 51)])
    ],
    [
        version('A', [insert('edit-a', note('note-a', 60, 'hole-a1', 'hole-a2'))]),
        version('B', [insert('edit-b', note('note-b', 62, 'hole-b'))], 'A'),
        version('C', [insert('edit-c', note('note-c', 64, 'hole-c'))], 'A')
    ]
)

const bearing = (edition: Edition, versionId: string, copyId: string) =>
    bearingsOf(edition, versionId).find(found => found.copy === copyId)

describe('how the copies bear what a version inserts', () => {
    it('finds each insertion on the copies of its line and on no other', () => {
        const edition = branches()

        expect(bearing(edition, 'B', 'first')).toEqual({
            version: 'B', copy: 'first', inLine: true,
            carried: ['note-b'], replaced: [], struck: [], keeps: [], unaccounted: []
        })
        expect(bearing(edition, 'B', 'second')).toMatchObject({ inLine: false, carried: [], unaccounted: [] })
        expect(bearing(edition, 'A', 'second')).toMatchObject({ inLine: true, carried: ['note-a'] })
        expect(filiationProblems(edition)).toEqual([])
    })

    it('reports an insertion a copy outside the line carries', () => {
        const edition = editionOf(
            [
                copy('first', [hole('hole-a1', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49)]),
                copy('second', [hole('hole-a2', 1000, 1010, 47), hole('hole-b2', 1100, 1110, 49), hole('hole-c', 1200, 1210, 51)])
            ],
            [
                version('A', [insert('edit-a', note('note-a', 60, 'hole-a1', 'hole-a2'))]),
                version('B', [insert('edit-b', note('note-b', 62, 'hole-b', 'hole-b2'))], 'A'),
                version('C', [insert('edit-c', note('note-c', 64, 'hole-c'))], 'A')
            ]
        )

        expect(bearing(edition, 'B', 'second')).toMatchObject({ inLine: false, carried: ['note-b'], unaccounted: ['note-b'] })
        expect(filiationProblems(edition)).toEqual([
            { version: 'B', symbol: 'note-b', copy: 'second', problem: 'carried-outside-its-line' }
        ])
    })

    it('reports an insertion a copy of the line lacks with nothing to account for it', () => {
        const edition = editionOf(
            [
                copy('first', [hole('hole-a1', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49)]),
                copy('second', [hole('hole-c', 1200, 1210, 51)])
            ],
            branches().versions
        )

        expect(bearing(edition, 'A', 'second')).toMatchObject({ inLine: true, carried: [], unaccounted: ['note-a'] })
        expect(filiationProblems(edition)).toEqual([
            { version: 'A', symbol: 'note-a', copy: 'second', problem: 'missing-from-its-line' }
        ])
    })

    it('accounts for an insertion a later version of the line struck', () => {
        const edition = editionOf(
            [
                copy('first', [hole('hole-a1', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49)]),
                copy('second', [hole('hole-c', 1200, 1210, 51)])
            ],
            [
                ...branches().versions.slice(0, 2),
                version('C', [insert('edit-c', note('note-c', 64, 'hole-c')), strike('strike-a', 'note-a')], 'A')
            ]
        )

        expect(bearing(edition, 'A', 'second')).toMatchObject({ struck: ['note-a'], unaccounted: [] })
        expect(filiationProblems(edition)).toEqual([])
    })

    it('follows an insertion through the replacements made of it further down the line', () => {
        const replace = (id: string, struck: string, ...inserted: Edit['insert'] & {}): Edit =>
            ({ type: 'edit', id, delete: [struck], insert: inserted })
        const edition = editionOf(
            [copy('roll', [hole('hole-d', 1050, 1060, 47)])],
            [
                version('A', [insert('edit-a', note('note-a', 60))]),
                version('B', [replace('edit-b', 'note-a', note('note-b', 60))], 'A'),
                version('C', [replace('edit-c', 'note-b', note('note-c', 60))], 'B'),
                version('D', [replace('edit-d', 'note-c', note('note-d', 60, 'hole-d'))], 'C')
            ]
        )

        expect(bearing(edition, 'B', 'roll')).toMatchObject({ inLine: true, carried: [], replaced: ['note-b'] })
        expect(filiationProblems(edition)).toEqual([])
    })

    it('reports a struck symbol a copy of the line still carries, and counts it as evidence outside the line', () => {
        const edition = editionOf(
            [
                copy('first', [hole('hole-a1', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49)]),
                copy('second', [hole('hole-a2', 1000, 1010, 47), hole('hole-c', 1200, 1210, 51)])
            ],
            [
                version('A', [insert('edit-a', note('note-a', 60, 'hole-a1', 'hole-a2'))]),
                version('B', [insert('edit-b', note('note-b', 62, 'hole-b'))], 'A'),
                version('C', [insert('edit-c', note('note-c', 64, 'hole-c')), strike('strike-a', 'note-a')], 'A')
            ]
        )

        expect(bearing(edition, 'C', 'first')).toMatchObject({ inLine: false, keeps: ['note-a'], unaccounted: [] })
        expect(bearing(edition, 'C', 'second')).toMatchObject({ inLine: true, keeps: ['note-a'], unaccounted: ['note-a'] })
        expect(filiationProblems(edition)).toEqual([
            { version: 'C', symbol: 'note-a', copy: 'second', problem: 'struck-yet-carried' }
        ])
    })

    it('leaves out a copy whose features carry no insertion', () => {
        const edition = editionOf([...branches().copies, copy('recorded', [])], branches().versions)

        expect(bearingsOf(edition, 'A').map(found => found.copy)).toEqual(['first', 'second'])
        expect(bearingsOf(edition, 'missing')).toEqual([])
    })
})

describe('insertions that put back what an ancestor struck', () => {
    const possibly: Belief = { type: 'belief', id: 'belief-from-a', certainty: 'possible', reasons: [] }

    /** A inserts a note on the first copy, B strikes it, and C on B puts the same note back at about the same place on the second. */
    const restoring = (alsoFromA: boolean): Edition => {
        const c: Version = version('C', [insert('edit-c', note('note-c', 60, 'hole-c'))], 'B')
        return editionOf(
            [
                copy('first', [hole('hole-a', 1000, 1010, 47)]),
                copy('second', [hole('hole-b', 1100, 1110, 49), hole('hole-c', 1002, 1012, 47)])
            ],
            [
                version('A', [insert('edit-a', note('note-a', 60, 'hole-a'))]),
                version('B', [insert('edit-b', note('note-b', 62, 'hole-b')), strike('strike-a', 'note-a')], 'A'),
                alsoFromA
                    ? { ...c, basedOn: [...c.basedOn ?? [], { id: 'A', '@annotation': { id: 'derivation-from-a', belief: possibly } }] }
                    : c
            ]
        )
    }

    it('reports a restoration no second derivation accounts for', () => {
        const edition = restoring(false)

        expect(restorationsOf(edition, 'C')).toEqual([{ symbol: 'note-c', restores: 'note-a', struckBy: 'B' }])
        expect(filiationProblems(edition)).toEqual([
            { version: 'C', symbol: 'note-c', problem: 'restores-a-strike' }
        ])
    })

    it('accounts for a restoration by a derivation from a version that still shows the struck symbol', () => {
        const edition = restoring(true)

        expect(restorationsOf(edition, 'C')).toEqual([{ symbol: 'note-c', restores: 'note-a', struckBy: 'B', from: 'A' }])
        expect(filiationProblems(edition)).toEqual([])
    })

    it('finds none where the insertion lies beyond the window of the collation', () => {
        const edition = restoring(false)
        const far = {
            ...edition,
            copies: edition.copies.map(found => found.id === 'second'
                ? copy('second', [hole('hole-b', 1100, 1110, 49), hole('hole-c', 1020, 1030, 47)])
                : found)
        }

        expect(restorationsOf(far, 'C')).toEqual([])
    })
})

describe('the types of a version\'s edits', () => {
    it('counts the edits by the type they state, those stating none together', () => {
        const typed = (id: string, editType: Edit['editType']): Edit => ({ ...strike(id, 'note-a'), editType })
        const counted = editTypesOf(version('B', [
            typed('one', 'additional-accent'), typed('two', 'additional-accent'), typed('three', 'correct-error'), strike('four', 'note-a')
        ], 'A'))

        expect([...counted]).toEqual([['additional-accent', 2], ['correct-error', 1], [undefined, 1]])
    })
})
