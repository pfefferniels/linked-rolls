import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import { beliefIn, Certainty, certaintyIn, PropositionSet } from '../src/model/Assumption'
import { Edition } from '../src/model/Edition'
import { Edit } from '../src/model/Edit'
import { derivationsOf } from '../src/model/Version'
import { isCollationsOwn } from '../src/collation/Collation'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { edition as smallEdition } from './editionFixture'

/**
 * Statements one reasoning concluded together are held together: each
 * names the proposition set in its annotation, and the set states the
 * belief once, with the reasoning, a program's run among them.
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

const run = (certainty: Certainty = 'likely'): PropositionSet => ({
    type: 'propositionSet',
    id: 'propositions_run',
    belief: {
        type: 'belief',
        id: 'belief_run',
        certainty,
        reasons: [{
            type: 'inference',
            note: 'The stemma a program proposed.',
            premises: [],
            used: ['first', 'second'],
            applies: ['https://welte225.org/rules#shared-addition'],
            software: [{ name: 'linked-rolls', version: '0.74.0' }],
            date: { within: new Date(2026, 9, 12) }
        }]
    }
})

/** The small edition with B's derivation one of a program's run, held as the run is. */
const proposed = (certainty: Certainty = 'likely'): Edition => {
    const edition = smallEdition()
    edition.base = 'https://example.org/edition/'
    const b = edition.versions.find(version => version.id === 'B')!
    b.basedOn = [{ id: 'A', '@annotation': { id: 'propositions_run' } }]
    edition.propositionSets = [run(certainty)]
    return edition
}

describe('a statement that belongs to a proposition set', () => {
    it('is held with the belief of the set', () => {
        const edition = proposed()
        const derivation = edition.versions.find(version => version.id === 'B')!.basedOn![0]
        expect(beliefIn(edition, derivation)?.id).toBe('belief_run')
        expect(certaintyIn(edition, derivation)).toBe('likely')
    })

    it('is held true where it carries no annotation, and with its own belief where it carries one', () => {
        const edition = proposed()
        expect(certaintyIn(edition, { id: 'A' })).toBe('true')
        const own = { id: 'A', '@annotation': { id: 'own', belief: { type: 'belief' as const, id: 'b', certainty: 'possible' as const, reasons: [] } } }
        expect(certaintyIn(edition, own)).toBe('possible')
    })

    it('reads as a derivation of the set, given the edition', () => {
        const edition = proposed()
        const b = edition.versions.find(version => version.id === 'B')!
        expect(derivationsOf(b, edition)).toEqual([{ parent: 'A', certainty: 'likely', belief: run().belief, propositionSet: 'propositions_run' }])
        expect(derivationsOf(b)[0]).toMatchObject({ parent: 'A', certainty: 'true', propositionSet: 'propositions_run' })
    })

    it('is a program\'s edit as long as nobody has motivated it, typed or not', () => {
        const member = (more: Partial<Edit>): Edit => ({ type: 'edit', id: 'e', insert: [], '@annotation': { id: 'propositions_run' }, ...more })
        expect(isCollationsOwn(member({}))).toBe(true)
        expect(isCollationsOwn(member({ editType: 'shift' }))).toBe(true)
        expect(isCollationsOwn(member({ editType: 'shift', motivation: 'unchecked' }))).toBe(true)
        expect(isCollationsOwn(member({ editType: 'shift', motivation: 'accent' }))).toBe(false)
        expect(isCollationsOwn({ type: 'edit', id: 'e', insert: [], editType: 'shift' })).toBe(false)
    })
})

describe('a proposition set in the export', () => {
    it('stands beside the edition, and a statement of it names it as the reifier of its annotation', () => {
        const document = asJsonLd(proposed())
        expect(document.propositionSets).toEqual([expect.objectContaining({ '@type': 'propositionSet', '@id': 'propositions_run' })])
        const b = document.versions.find((version: Json) => version['@id'] === 'B')
        expect(b.basedOn).toEqual([{ '@id': 'A', '@annotation': { '@id': 'propositions_run' } }])
        expect(document['@included']).toBeUndefined()
    })

    it('is read back as it was written', () => {
        const edition = proposed()
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(edition))))
        expect(back.propositionSets).toEqual(edition.propositionSets)
        expect(back.versions.find(version => version.id === 'B')!.basedOn).toEqual([{ id: 'A', '@annotation': { id: 'propositions_run' } }])
    })

    it('holds to the schema', () => {
        expect(validate(asJsonLd(proposed()))).toBe(true)
        expect(validate.errors).toBeFalsy()
    })

    it('reads as a proposition set held under a belief that a program\'s run concluded', async () => {
        const quads = await jsonld.toRDF(asJsonLd(proposed()), { format: 'application/n-quads', documentLoader }) as unknown as string
        const set = '<https://example.org/edition/propositions_run>'
        const belief = '<https://example.org/edition/belief_run>'
        const lines = quads.split('\n')
        expect(lines).toContain(`${set} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.cidoc-crm.org/extensions/crminf/I4_Proposition_Set> .`)
        expect(lines).toContain(`${set} <http://www.cidoc-crm.org/extensions/crminf/J4i_is_subject_of> ${belief} .`)
        const reason = lines.find(line => line.startsWith(belief) && line.includes('J2i_was_concluded_by'))!.split(' ')[2]
        expect(lines.some(line => line.startsWith(reason) && line.includes('crmdig/L23_used_software_or_firmware'))).toBe(true)
        expect(lines.some(line => line.startsWith(reason) && line.includes('P4_has_time-span'))).toBe(true)
        expect(lines).toContain(`${reason} <http://www.cidoc-crm.org/extensions/crminf/J3_applied> <https://welte225.org/rules#shared-addition> .`)
    })

    it('quotes rather than states the statements of a set held below likely, and reads them back into it', () => {
        const edition = proposed('possible')
        const document = asJsonLd(edition)
        const b = document.versions.find((version: Json) => version['@id'] === 'B')
        expect(b.basedOn).toEqual([])
        expect(document['@included']).toEqual([{
            '@id': { '@id': 'B', basedOn: [{ '@id': 'A' }] },
            annotation: 'propositions_run',
            belief: { '@id': 'belief_run' }
        }])
        const back = importJsonLd(JSON.parse(JSON.stringify(document)))
        expect(back.versions.find(version => version.id === 'B')!.basedOn).toEqual([{ id: 'A', '@annotation': { id: 'propositions_run' } }])
        expect(back.propositionSets).toEqual(edition.propositionSets)
    })
})
