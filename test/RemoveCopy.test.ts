import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Hole } from '../src/Feature'
import { RollCopy } from '../src/RollCopy'
import { Expression, Note, Text } from '../src/Symbol'
import { Version } from '../src/Version'
import { assignReference, assignValue, idsOf } from '../src/Assumption'
import { removeCopy, symbolsCarriedOnlyBy } from '../src/Plan'

const hole = (id: string, from: number, to: number, track: number): Hole => ({
    type: 'Hole',
    id,
    horizontal: { unit: 'mm', from, to },
    vertical: { unit: 'track', from: track }
})

const copy = (id: string, features: Hole[]): RollCopy => ({
    type: 'RollCopy',
    id,
    ops: [],
    measurements: {},
    conditions: [],
    modifications: [],
    keeper: { name: id, sameAs: [] },
    features
})

const note = (id: string, pitch: number, ...carriers: string[]): Note => ({
    type: 'note',
    id,
    pitch,
    carriers: carriers.map(assignReference)
})

const expression = (id: string, expressionType: string, carrier: string): Expression => ({
    type: 'expression',
    id,
    expressionType,
    scope: 'treble',
    carriers: [assignReference(carrier)]
})

const version = (id: string, edits: Version['edits'], basedOn?: string): Version => ({
    type: 'Version',
    id,
    siglum: id,
    versionType: 'edition',
    edits,
    motivations: [],
    ...(basedOn ? { basedOn: assignReference(basedOn) } : {})
})

const nobody = { name: '', sameAs: [] }

/**
 * A roll in two copies and two versions. Both copies carry the note,
 * the first alone carries a second note and a forzando on and off,
 * and the note is placed against the second note and paired with the
 * forzando on. Version B takes the forzando on away. A label stands
 * on no copy at all.
 */
const edition = (): Edition => ({
    base: '',
    title: '',
    license: '',
    creation: { publisher: nobody, publicationDate: new Date() },
    roll: {
        catalogueNumber: '',
        system: nobody,
        recordingEvent: { recorded: { pianist: nobody, playing: '' }, place: nobody, date: assignValue(new Date()) }
    },
    copies: [
        copy('first', [
            hole('hole-note', 1000, 1010, 47),
            hole('hole-other-note', 1020, 1030, 49),
            hole('hole-off', 1004, 1006, 95),
            hole('hole-on', 990, 992, 96)
        ]),
        copy('second', [hole('hole-note-second', 1001, 1011, 47)])
    ],
    versions: [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                {
                    ...note('note', 60, 'hole-note', 'hole-note-second'),
                    alignedWith: assignReference('other-note'),
                    pairedWith: assignReference('forzando-on')
                },
                note('other-note', 62, 'hole-other-note'),
                expression('forzando-off', 'ForzandoOff', 'hole-off'),
                expression('forzando-on', 'ForzandoOn', 'hole-on'),
                { type: 'text', id: 'label', text: 'WM 225', carriers: [] } satisfies Text
            ]
        }]),
        version('B', [{ type: 'edit', id: 'edit-b', delete: ['forzando-on'] }], 'A')
    ]
})

const noteIn = (edition: Edition) => new EditionView(edition).get<Note>('note')!

describe('removing a copy', () => {
    it('names the symbols only the copy carries', () => {
        expect(symbolsCarriedOnlyBy(edition(), 'first').map(symbol => symbol.id))
            .toEqual(['other-note', 'forzando-off', 'forzando-on'])
        expect(symbolsCarriedOnlyBy(edition(), 'second')).toEqual([])
        expect(symbolsCarriedOnlyBy(edition(), 'nothing')).toEqual([])
    })

    it('takes the copy and the symbols only it carries out of the edition', () => {
        const next = produce(edition(), removeCopy('first'))
        const view = new EditionView(next)

        expect(next.copies.map(copy => copy.id)).toEqual(['second'])
        expect(next.versions[0].edits[0].insert?.map(symbol => symbol.id)).toEqual(['note', 'label'])
        expect(idsOf(noteIn(next).carriers)).toEqual(['hole-note-second'])
        expect(view.dimensionOf(noteIn(next))?.horizontal.from).toBe(1001)
    })

    it('leaves no reference to a dropped symbol behind', () => {
        const next = produce(edition(), removeCopy('first'))

        expect('alignedWith' in noteIn(next)).toBe(false)
        expect('pairedWith' in noteIn(next)).toBe(false)
        expect(next.versions[1].edits).toEqual([])
    })

    it('keeps an edit that was empty before the removal', () => {
        const withEmptyEdit = produce(edition(), draft => {
            draft.versions[1].edits.push({ type: 'edit', id: 'edit-empty' })
        })
        const next = produce(withEmptyEdit, removeCopy('first'))

        expect(next.versions[1].edits.map(edit => edit.id)).toEqual(['edit-empty'])
    })

    it('only strips the carriers of a copy whose every symbol another copy carries too', () => {
        const next = produce(edition(), removeCopy('second'))

        expect(next.copies.map(copy => copy.id)).toEqual(['first'])
        expect(next.versions[0].edits[0].insert?.length).toBe(5)
        expect(idsOf(noteIn(next).carriers)).toEqual(['hole-note'])
    })

    it('leaves the edition as it is for an unknown id', () => {
        const before = edition()
        expect(produce(before, removeCopy('nothing'))).toBe(before)
    })
})
