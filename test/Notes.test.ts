import { describe, expect, it } from 'vitest'
import { partsOfNote, referencesInNote, resolveNote } from '../src/model/notes'

const names: Record<string, string> = { 'version-1': 'R1', 'copy-2': 'St1' }
const nameOf = (id: string) => names[id]

describe('a note that refers instead of naming', () => {
    it('reads as text where it refers to nothing', () => {
        expect(partsOfNote('Eine Stanzung bei 7364,7 mm.')).toEqual([
            { type: 'text', text: 'Eine Stanzung bei 7364,7 mm.' }
        ])
    })

    it('splits the text at what it refers to', () => {
        expect(partsOfNote('Was {{version-1}} hinzufügt, trägt {{copy-2}}.')).toEqual([
            { type: 'text', text: 'Was ' },
            { type: 'reference', id: 'version-1' },
            { type: 'text', text: ' hinzufügt, trägt ' },
            { type: 'reference', id: 'copy-2' },
            { type: 'text', text: '.' }
        ])
    })

    it('names the entities it refers to, in order', () => {
        expect(referencesInNote('{{copy-2}} gegen {{version-1}}')).toEqual(['copy-2', 'version-1'])
    })

    it('resolves every reference to the name the edition gives it', () => {
        expect(resolveNote('Was {{version-1}} hinzufügt, trägt {{copy-2}}.', nameOf))
            .toBe('Was R1 hinzufügt, trägt St1.')
    })

    it('keeps the id of a reference nothing answers to, so the gap shows', () => {
        expect(resolveNote('Gegen {{version-9}}.', nameOf)).toBe('Gegen version-9.')
    })

    it('reads a reference written with spaces inside the braces', () => {
        expect(resolveNote('Gegen {{ version-1 }}.', nameOf)).toBe('Gegen R1.')
    })
})

describe('a reference that puts the note\'s own words in its place', () => {
    it('carries the label beside the id', () => {
        expect(partsOfNote('Das {{sym-3|zweite An bei 7364,7 mm}} allein in St1.')).toEqual([
            { type: 'text', text: 'Das ' },
            { type: 'reference', id: 'sym-3', label: 'zweite An bei 7364,7 mm' },
            { type: 'text', text: ' allein in St1.' }
        ])
    })

    it('reads the label where the edition names the entity nothing', () => {
        expect(resolveNote('Das {{sym-3|zweite An bei 7364,7 mm}}.', nameOf))
            .toBe('Das zweite An bei 7364,7 mm.')
    })

    it('lets the name win, so that a siglum written out cannot freeze it', () => {
        expect(resolveNote('Gegen {{version-1|B2}}.', nameOf)).toBe('Gegen R1.')
    })

    it('names what a labelled reference points at, like any other', () => {
        expect(referencesInNote('{{sym-3|die Stanzung}} und {{version-1}}')).toEqual(['sym-3', 'version-1'])
    })

    it('keeps an empty label out of the way', () => {
        expect(partsOfNote('{{sym-3|}}')).toEqual([{ type: 'reference', id: 'sym-3' }])
    })
})
