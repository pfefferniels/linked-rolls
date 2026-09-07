import { describe, expect, it } from 'vitest'
import { Editor } from '../src/Agent'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { edition } from './editionFixture'

const editors: Editor[] = [
    { name: 'Bach, Anna Magdalena', sameAs: [], role: 'transcription' },
    { name: 'Forkel, Johann Nikolaus', sameAs: [], role: 'commentary' }
]

const reimported = (exported: object) => importJsonLd(JSON.parse(JSON.stringify(exported)))

describe('Editors', () => {
    it('carries the editors with their roles through an export', () => {
        const edited = edition()
        edited.creation.editors = editors

        const exported = asJsonLd(edited)
        expect(exported.creation.editors).toEqual(editors)
        expect(reimported(exported).creation.editors).toEqual(editors)
    })

    it('reads an edition written before editors were carried', () => {
        const exported = asJsonLd(edition()) as any
        delete exported.creation.editors

        expect(reimported(exported).creation.editors).toEqual([])
    })
})
