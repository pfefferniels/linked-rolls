import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import welteLicenseeContext from '../src/spec/welte-licensee.context.json'
import welteT98Context from '../src/spec/welte-t98.context.json'
import { AnyFeature, GluedOn, Mark, NestedFeature, Transcription, Writing } from '../src/Feature'
import { assignObject } from '../src/Assumption'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { mm, track } from '../src/Quantity'
import { copy, editionOf, hole, note, version } from './editionFixture'

/**
 * A hole, a writing and a mark are all instances of E25 Human-Made
 * Feature, so the class tells none of them from the others. The kind
 * each feature states with P2 has type is what holds them apart, and
 * the making of a trace is stated with reo:method beside it.
 */

type Json = any

const contexts: Record<string, Json> = {
    'https://w3id.org/reo/context.jsonld': context,
    'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context,
    'https://w3id.org/reo/welte-licensee/context.jsonld': welteLicenseeContext,
    'https://w3id.org/reo/welte-green/context.jsonld': welteT98Context
}

const documentLoader = async (url: string) => {
    const document = contexts[url]
    if (!document) throw new Error(`no local copy of ${url}`)
    return { contextUrl: undefined, documentUrl: url, document }
}

const base = 'https://example.org/edition/'
const crm = 'http://www.cidoc-crm.org/cidoc-crm/'
const reo = 'https://w3id.org/reo/'
const reot = 'https://w3id.org/reo/type/'
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

const at = (from: number, to: number, position: number) => ({
    horizontal: { unit: 'mm' as const, from: mm(from), to: mm(to) },
    vertical: { unit: 'track' as const, from: track(position) }
})

const stamp: NestedFeature = {
    type: 'Writing',
    id: 'stamp',
    method: 'stamp',
    transcription: assignObject<Transcription>({ type: 'text', id: 'stamp-text', text: 'Welte' })
}

const writing: Writing = {
    type: 'Writing',
    id: 'date',
    ...at(20, 60, 47),
    method: 'handwriting',
    transcription: assignObject<Transcription>({ type: 'text', id: 'date-text', text: '20.I.1905' })
}

const mark: Mark = { type: 'Mark', id: 'circle', ...at(80, 90, 47), method: 'pencil' }

const patch: GluedOn = { type: 'GluedOn', id: 'patch', ...at(100, 140, 47), material: 'paper', features: [stamp] }

const features: AnyFeature[] = [hole('perforation', 10, 12, 47), writing, mark, patch]

/** A copy carrying one feature of each kind, the patch bearing a writing of its own. */
const withFeatures = () => editionOf(
    [copy('first', features)],
    [version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'perforation')] }])]
)

const exported = () => {
    const edition = withFeatures()
    edition.base = base
    return JSON.parse(JSON.stringify(asJsonLd(edition)))
}

interface Triple { subject: string, property: string, object: string }

const triples = async (): Promise<Triple[]> => {
    const quads = await jsonld.toRDF(exported(), {
        format: 'application/n-quads',
        documentLoader
    }) as unknown as string

    return quads.split('\n').flatMap(line => {
        const stated = /^<([^>]+)> <([^>]+)> (.+) \.$/.exec(line.trim())
        return stated ? [{ subject: stated[1], property: stated[2], object: stated[3].replace(/^<|>$/g, '') }] : []
    })
}

/** What the graph states about the feature under the property. */
const statedOf = (all: Triple[], feature: string, property: string): string[] =>
    all.filter(({ subject, property: stated }) => subject === `${base}${feature}` && stated === property)
        .map(({ object }) => object)

describe('the kind of a feature', () => {
    it('goes out on every feature, borne features and all', () => {
        const copy = exported().copies[0]
        expect(copy.features.map((feature: Json) => [feature['@type'], feature.kind])).toEqual([
            ['Hole', 'hole'],
            ['Writing', 'writing'],
            ['Mark', 'mark'],
            ['GluedOn', 'glued-on']
        ])
        expect(copy.features[3].features[0].kind).toEqual('writing')
    })

    it('is read back off the type rather than kept', () => {
        const read = importJsonLd(exported())
        expect(read.copies[0].features).toEqual(features)
        expect(asJsonLd(read).copies[0].features).toEqual(exported().copies[0].features)
    })

    it('holds the four apart in the graph', async () => {
        const all = await triples()
        expect(statedOf(all, 'perforation', `${crm}P2_has_type`)).toEqual([`${reot}hole`])
        expect(statedOf(all, 'date', `${crm}P2_has_type`)).toEqual([`${reot}writing`])
        expect(statedOf(all, 'circle', `${crm}P2_has_type`)).toEqual([`${reot}mark`])
        expect(statedOf(all, 'patch', `${crm}P2_has_type`)).toEqual([`${reot}glued-on`])
    })

    it('states a hole as a human-made feature', async () => {
        const all = await triples()
        expect(statedOf(all, 'perforation', `${rdf}type`)).toEqual([`${crm}E25_Human-Made_Feature`])
    })

    it('keeps the making of a trace apart from its kind', async () => {
        const all = await triples()
        expect(statedOf(all, 'date', `${reo}method`)).toEqual([`${reot}handwriting`])
        expect(statedOf(all, 'circle', `${reo}method`)).toEqual([`${reot}pencil`])
        expect(statedOf(all, 'patch', `${crm}P45_consists_of`)).toEqual([`${reot}paper`])
    })
})
