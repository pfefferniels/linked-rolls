import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import { Edition } from '../src/model/Edition'
import { correctedError, Edit, kindOfChange, musicalChange, safeguard } from '../src/model/Edit'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { linkedRolls } from '../src/software'
import { edition as smallEdition } from './editionFixture'

/**
 * What kind of change an edit is follows from its motivation. The
 * edition states its own motivations once, and its creation names the
 * principles it follows and the release of the library it was made with.
 */

type Json = any

const contexts: Record<string, Json> = {
    'https://w3id.org/reo/context.jsonld': context,
    'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context
}

const documentLoader = async (url: string) => {
    const document = contexts[url]
    if (!document) throw new Error(`no local copy of ${url}`)
    return { contextUrl: undefined, documentUrl: url, document }
}

const rule = 'https://welte225.org/rules#shared-addition'

/** The small edition, B's edit motivated by the edition's own reason, made by this release by a published rule. */
const motivated = (): Edition => {
    const edition = smallEdition()
    edition.base = 'https://example.org/edition/'
    edition.motivations = [{ type: 'motivation', id: 'accent', note: 'An accent withdrawn.' }]
    edition.versions.find(version => version.id === 'B')!.edits![0].motivation = 'accent'
    edition.creation.principles = [rule]
    edition.creation.software = [linkedRolls]
    return edition
}

describe('the kind of change an edit is', () => {
    const edit = (motivation?: string): Edit => ({ type: 'edit', id: 'e', ...(motivation && { motivation }) })

    it('is technical where it states no motivation, or a safeguard', () => {
        expect(kindOfChange(edit())).toBe('technical')
        expect(kindOfChange(edit(safeguard))).toBe('technical')
    })

    it('is a repair where it puts right an error', () => {
        expect(kindOfChange(edit(correctedError))).toBe('repair')
    })

    it('is musical for the generic motivation and for every reason of the edition\'s own', () => {
        expect(kindOfChange(edit(musicalChange))).toBe('musical')
        expect(kindOfChange(edit('accent'))).toBe('musical')
    })
})

describe('the motivations, principles and software of an edition', () => {
    it('are written once for the edition, and read back as they were', () => {
        const edition = motivated()
        const document = asJsonLd(edition)
        expect(document.motivations).toEqual([{ '@type': 'motivation', '@id': 'accent', note: 'An accent withdrawn.' }])
        expect(document.creation.principles).toEqual([rule])
        expect(document.creation.software).toEqual([linkedRolls])
        expect(document.versions.every((version: Json) => !('motivations' in version))).toBe(true)

        const back = importJsonLd(JSON.parse(JSON.stringify(document)))
        expect(back.motivations).toEqual(edition.motivations)
        expect(back.creation.principles).toEqual([rule])
        expect(back.creation.software).toEqual([linkedRolls])
        expect(back.versions).toEqual(edition.versions)
    })

    it('hold to the schema', () => {
        expect(validate(asJsonLd(motivated()))).toBe(true)
        expect(validate.errors).toBeFalsy()
    })

    it('read as the techniques and the software of the creation, and the reason of the edit', async () => {
        const edition = motivated()
        edition.versions.find(version => version.id === 'A')!.edits![0].motivation = musicalChange
        const quads = await jsonld.toRDF(asJsonLd(edition), { format: 'application/n-quads', documentLoader }) as unknown as string
        const lines = quads.split('\n')
        const creation = lines.find(line => line.startsWith('<https://example.org/edition/> <http://iflastandards.info/ns/lrm/lrmoo/R17i_was_created_by>'))!.split(' ')[2]
        expect(lines).toContain(`${creation} <http://www.cidoc-crm.org/cidoc-crm/P33_used_specific_technique> <${rule}> .`)
        const software = lines.find(line => line.startsWith(creation) && line.includes('P16_used_specific_object'))!.split(' ')[2]
        expect(lines).toContain(`${software} <http://www.w3.org/2002/07/owl#versionInfo> "${linkedRolls.version}" .`)
        expect(lines.some(line => line.includes('P17_was_motivated_by> <https://example.org/edition/accent>'))).toBe(true)
        expect(lines.some(line => line.includes(`P17_was_motivated_by> <${musicalChange}>`))).toBe(true)
        expect(lines.some(line => line.includes('crminf/I4_Proposition_Set'))).toBe(false)
    })
})
