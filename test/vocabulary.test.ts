import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import schema from '../src/schema.json'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import welteLicenseeContext from '../src/spec/welte-licensee.context.json'
import welteT98Context from '../src/spec/welte-t98.context.json'
import { trackerBars } from '../src/systems'
import { resolve } from './schema'

/**
 * A value read against the type vocabulary has to come out as a type.
 * JSON-LD expands a value that is also the name of a term to that term's
 * IRI before it tries the vocabulary, which once made a copy read from a
 * `scan` into one typed crm:P138i. Every value the schema allows is
 * expanded here in the place the format puts it.
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

const shared: Json = context['@context']

const expandPrefix = (iri: string): string => {
    const colon = iri.indexOf(':')
    const namespace = shared[iri.slice(0, colon)]
    return typeof namespace === 'string' ? namespace + iri.slice(colon + 1) : iri
}

interface VocabularyKey {
    key: string
    property: string
    vocabulary: string
}

/** The keys whose values the context reads against a vocabulary, at any depth. */
const vocabularyKeysIn = (ctx: Json): VocabularyKey[] =>
    Object.entries<Json>(ctx)
        .filter(([term]) => !term.startsWith('@'))
        .flatMap(([key, definition]) => [
            ...(definition?.['@type'] === '@vocab'
                ? [{ key, property: expandPrefix(definition['@id']), vocabulary: definition['@context']['@vocab'] }]
                : []),
            ...(definition?.['@context'] ? vocabularyKeysIn(definition['@context']) : [])
        ])

const valuesIn = (node: Json): string[] => {
    const resolved = resolve(node)
    if (!resolved) return []
    return [
        ...(typeof resolved.const === 'string' ? [resolved.const] : []),
        ...(resolved.enum ?? []),
        ...[...(resolved.anyOf ?? []), ...(resolved.allOf ?? [])].flatMap(valuesIn)
    ]
}

/** Every value the schema allows under the key, wherever the key occurs. */
const allowedValuesOf = (key: string): string[] => {
    const found = new Set<string>()
    const seen = new Set<Json>()
    const visit = (node: Json) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return
        seen.add(node)
        valuesIn(node.properties?.[key]).forEach(value => found.add(value))
        const children = [
            ...Object.values(node.properties ?? {}),
            node.items, ...(node.anyOf ?? []), ...(node.allOf ?? []), ...(node.oneOf ?? [])
        ]
        children.filter(Boolean).forEach(visit)
    }
    ;[schema, ...Object.values((schema as Json).definitions)].forEach(visit)
    return [...found]
}

const node = (type: string, fields: Json): Json => ({ '@type': type, '@id': `${type}-node`, ...fields })

const copyWith = (fields: Json): Json => ({ copies: [node('RollCopy', fields)] })

/** A feature as the copy states it: in the act that brought it about. */
const punched = (feature: Json): Json => copyWith({ production: { produced: [feature] } })

const gluedOn = (patch: Json): Json =>
    copyWith({ modifications: [{ '@type': 'Attachment', added: [patch] }] })

/** A feature a later hand brought about, which is where a writing or a mark belongs. */
const altered = (feature: Json): Json =>
    copyWith({ modifications: [{ '@type': 'Alteration', produced: [feature] }] })

const expressionWith = (fields: Json, systemContext?: string): Json => ({
    versions: [{
        ...(systemContext && { '@context': systemContext }),
        ...node('Version', { edits: [node('edit', { insert: [node('expression', fields)] })] })
    }]
})

/** Where the format puts each key read against the vocabulary, as part of an edition. */
const placements: Record<string, (value: string) => Json> = {
    kind: value => copyWith({ readFrom: { kind: value } }),
    role: value => copyWith({ keeper: { name: 'keeper', role: value } }),
    conditionType: value => copyWith({ conditions: [{ '@type': 'ConditionState', conditionType: value }] }),
    unit: value => punched(node('HoleChain', { horizontal: { unit: value, from: 1, to: 2 } })),
    technique: value => altered(node('Writing', { technique: value })),
    medium: value => altered(node('Writing', { medium: value })),
    side: value => altered(node('Writing', { side: value })),
    material: value => gluedOn(node('GluedOn', { material: value })),
    purpose: value => copyWith({ modifications: [{ '@type': 'Alteration', purpose: value }] }),
    editType: value => ({ versions: [node('Version', { edits: [node('edit', { editType: value })] })] }),
    scope: value => expressionWith({ scope: value }),
    expressionType: value => expressionWith({ expressionType: value })
}

const editionWith = (part: Json): Json => ({
    '@context': ['https://w3id.org/reo/context.jsonld', { '@base': 'https://example.org/edition/' }],
    '@type': 'Edition',
    '@id': 'https://example.org/edition/',
    ...part
})

/** Every reference in an expanded document, as the property and the IRI it refers to. */
const referencesIn = (expanded: Json): string[] => {
    if (Array.isArray(expanded)) return expanded.flatMap(referencesIn)
    if (!expanded || typeof expanded !== 'object') return []
    return Object.entries<Json>(expanded)
        .filter(([property]) => !property.startsWith('@'))
        .flatMap(([property, values]) => [
            ...(Array.isArray(values) ? values : [])
                .filter(value => typeof value?.['@id'] === 'string')
                .map(value => `${property} ${value['@id']}`),
            ...referencesIn(values)
        ])
}

/** The values that do not come out as the vocabulary's term for them. */
const misreadValues = async (values: readonly string[], place: (value: string) => Json, { property, vocabulary }: VocabularyKey) => {
    const expansions = await Promise.all(values.map(async value => ({
        value,
        references: referencesIn(await jsonld.expand(editionWith(place(value)), { documentLoader }))
    })))
    return expansions
        .filter(({ value, references }) => !references.includes(`${property} ${vocabulary}${value}`))
        .map(({ value }) => value)
}

describe('values read against the type vocabulary', () => {
    const keys = vocabularyKeysIn(shared)

    it('knows where the format puts every such key', () => {
        expect(keys.map(({ key }) => key).filter(key => !(key in placements))).toEqual([])
    })

    it.each(keys.filter(({ key }) => key !== 'expressionType'))('expands every $key to a type', async key => {
        const values = allowedValuesOf(key.key)
        expect(values.length).toBeGreaterThan(0)
        expect(await misreadValues(values, placements[key.key], key)).toEqual([])
    })

    it.each(trackerBars.map(bar => ({ system: bar.id, bar })))(
        'expands every expression type of the $system to a type of its system',
        async ({ bar }) => {
            const url = `https://w3id.org/reo/${bar.id}/context.jsonld`
            const [key] = vocabularyKeysIn(contexts[url]['@context'])
            expect(await misreadValues(bar.expressionTypes, value => expressionWith({ expressionType: value }, url), key))
                .toEqual([])
        })
})
