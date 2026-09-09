import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Note } from '../src/Symbol'
import { idsOf } from '../src/Assumption'
import { removeCopy, symbolsCarriedOnlyBy } from '../src/editionOps'
import { edition } from './editionFixture'

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
        expect(view.placeOf(noteIn(next))?.from).toBe(1001)
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
