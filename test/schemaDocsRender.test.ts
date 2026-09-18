import { describe, expect, it } from 'vitest'
import type { Definition, OntologyTerm, Property, SchemaDoc, TypeExpression } from '../schema/docs/model.ts'
import { renderPage } from '../schema/docs/render.ts'

const property = (anchor: string, type: TypeExpression, rest: Partial<Property> = {}): Property => ({
    name: anchor.split('.').at(-1)!,
    anchor,
    required: false,
    deprecated: false,
    ontology: [],
    examples: [],
    type,
    ...rest,
})

const definition = (name: string, type: TypeExpression, rest: Partial<Definition> = {}): Definition => ({
    name,
    anchor: name,
    deprecated: false,
    ontology: [],
    usedIn: [],
    type,
    ...rest,
})

const string: TypeExpression = { kind: 'primitive', type: 'string' }
const resolution = 'Quantity<"px/in">'
const witness: OntologyTerm = { curie: 'reo:witness', url: 'reo/#witness' }
const expression: OntologyTerm = {
    curie: 'lrmoo:F2',
    label: 'Expression',
    url: 'https://cidoc-crm.org/extensions/lrmoo/html/LRMoo_v1.0.html#F2',
}

const doc: SchemaDoc = {
    definitions: [
        definition('Edition', {
            kind: 'object',
            properties: [
                property('Edition.title', string, {
                    required: true,
                    description: 'The `title` of the edition.',
                    examples: ['Träumerei'],
                }),
                property('Edition.@type', { kind: 'literal', value: 'Edition' }, { required: true }),
                property('Edition.copies', { kind: 'array', items: { kind: 'reference', name: 'RollCopy' } }, {
                    ontology: [witness],
                }),
                property('Edition.scan', {
                    kind: 'object',
                    properties: [
                        property('Edition.scan.resolution', { kind: 'reference', name: resolution }),
                        property('Edition.scan.measuredBy', {
                            kind: 'array',
                            items: {
                                kind: 'object',
                                properties: [
                                    property('Edition.scan.measuredBy.date', { kind: 'primitive', type: 'string', format: 'date' }),
                                ],
                            },
                        }),
                    ],
                }),
                property('Edition.@id', { kind: 'any' }),
                property('Edition.label', string, {
                    deprecated: true,
                    description: 'The name the edition was cited by. Use `title`.',
                }),
            ],
        }, { description: 'The root.', ontology: [expression] }),
        definition('RollCopy', {
            kind: 'object',
            properties: [
                property('RollCopy.condition', {
                    kind: 'union',
                    members: [
                        { kind: 'reference', name: 'Certainty' },
                        {
                            kind: 'object',
                            properties: [
                                property('RollCopy.condition.2.@type', { kind: 'literal', value: 'PaperStretch' }),
                                property('RollCopy.condition.2.factor', { kind: 'primitive', type: 'number' }),
                            ],
                        },
                    ],
                }),
                property('RollCopy.features', {
                    kind: 'array',
                    items: {
                        kind: 'union',
                        members: [{ kind: 'reference', name: 'AnyFeature' }, { kind: 'literal', value: 'none' }],
                    },
                }),
            ],
        }, { usedIn: [{ label: 'Edition.copies', anchor: 'Edition.copies' }] }),
        definition('AnyFeature', {
            kind: 'union',
            members: [
                { kind: 'reference', name: 'hole' },
                { kind: 'literal', value: 'none' },
                {
                    kind: 'object',
                    properties: [
                        property('AnyFeature.3.@type', { kind: 'literal', value: 'Writing' }),
                        property('AnyFeature.3.text', string, { required: true }),
                    ],
                },
            ],
        }, { usedIn: [{ label: 'RollCopy.features', anchor: 'RollCopy.features' }] }),
        definition('hole', { kind: 'reference', name: resolution }, {
            usedIn: [{ label: 'AnyFeature', anchor: 'AnyFeature' }],
        }),
        definition(resolution, { kind: 'primitive', type: 'number' }, {
            anchor: 'Quantity-px-in',
            usedIn: [
                { label: 'Edition.scan.resolution', anchor: 'Edition.scan.resolution' },
                { label: 'hole', anchor: 'hole' },
            ],
        }),
        definition('Certainty', { kind: 'enumeration', values: ['true', 'likely'] }),
        definition('Siglum', { kind: 'literal', value: 'A' }, { deprecated: true }),
        definition('Sigla', { kind: 'array', items: string }),
        definition('Rows', {
            kind: 'array',
            items: {
                kind: 'object',
                properties: [property('Rows.a', string), property('Rows.leaf', { kind: 'reference', name: 'Siglum' })],
            },
        }),
        definition('Listing', {
            kind: 'object',
            properties: [
                property('Listing.list', {
                    kind: 'union',
                    members: [
                        { kind: 'object', properties: [property('Listing.list.1.a', string)] },
                        { kind: 'array', items: { kind: 'object', properties: [property('Listing.list.2.b', string)] } },
                    ],
                }),
            ],
        }),
        definition('Either', {
            kind: 'union',
            members: [string, { kind: 'array', items: { kind: 'object', properties: [property('Either.2.b', string)] } }],
        }),
        definition('Anything', { kind: 'any' }),
    ],
}

const page = renderPage(doc, 'body { color: #1f2937 }')

const between = (html: string, start: string, end: string): string => {
    const from = html.indexOf(start)
    expect(from).toBeGreaterThanOrEqual(0)
    return html.slice(from, html.indexOf(end, from))
}

const row = (anchor: string): string => between(page, `<tr id="${anchor}"`, '</tr>')
const section = (anchor: string): string => between(page, `<section id="${anchor}"`, '</section>')

describe('renderPage', () => {
    it('is a complete document with the stylesheet inlined and no script', () => {
        expect(page.startsWith('<!doctype html>')).toBe(true)
        expect(page).toContain('<html lang="en">')
        expect(page).toContain('<title>Roll Edition Format</title>')
        expect(page).toContain('body { color: #1f2937 }')
        expect(page).not.toContain('<script')
    })

    it('links only to anchors that exist', () => {
        const ids = new Set([...page.matchAll(/\bid="([^"]*)"/g)].map(match => match[1]))
        const targets = [...page.matchAll(/href="#([^"]*)"/g)].map(match => match[1])
        expect(targets.length).toBeGreaterThan(10)
        expect(targets.filter(target => !ids.has(target))).toEqual([])
    })

    it('escapes names and keeps them intact', () => {
        expect(page).not.toContain(resolution)
        expect(section('Quantity-px-in')).toContain('<code>Quantity&lt;<wbr>&quot;px/in&quot;&gt;</code>')
        expect(row('Edition.scan.resolution')).toContain('<a href="#Quantity-px-in">Quantity&lt;<wbr>&quot;px/in&quot;&gt;</a>')
    })

    it('turns backtick spans in descriptions into code', () => {
        expect(row('Edition.title')).toContain('<p>The <code>title</code> of the edition.</p>')
    })

    it('marks required properties only', () => {
        expect(row('Edition.title')).toContain('<span class="required">required</span>')
        expect(row('Edition.copies')).not.toContain('required')
    })

    it('marks a deprecated property and a deprecated definition, and says what to use instead', () => {
        expect(row('Edition.label')).toContain('<span class="deprecated">deprecated</span>')
        expect(row('Edition.label')).toContain('Use <code>title</code>.')
        expect(row('Edition.title')).not.toContain('deprecated')
        expect(section('Siglum')).toContain('<span class="deprecated">deprecated</span>')
        expect(section('Certainty')).not.toContain('deprecated')
    })

    it('lists @-properties first and keeps the order otherwise', () => {
        const order = ['Edition.@type', 'Edition.@id', 'Edition.title', 'Edition.copies', 'Edition.scan']
            .map(anchor => page.indexOf(`<tr id="${anchor}"`))
        expect(order).toEqual([...order].sort((a, b) => a - b))
    })

    it('continues a property with the rows of its inline object, as a muted dotted path', () => {
        expect(row('Edition.scan.measuredBy.date'))
            .toContain('<code><span class="parent">scan.</span><span class="parent">measuredBy.</span>date</code>')
        expect(row('Edition.scan.measuredBy.date')).toContain('--depth: 2')
        expect(row('Edition.scan.measuredBy.date')).toContain('string (date)')
    })

    it('heads the rows of a union variant inside a table', () => {
        const table = section('RollCopy')
        expect(table).toContain('Variant 2 <code>&quot;PaperStretch&quot;</code>')
        expect(table.indexOf('Variant 2')).toBeLessThan(table.indexOf('<tr id="RollCopy.condition.2.@type"'))
    })

    it('shows a union definition as its members', () => {
        const union = section('AnyFeature')
        expect(union).toContain('<span class="kind">one of</span>')
        expect(union).toContain('<a href="#hole">hole</a>')
        expect(union).toContain('<code>&quot;none&quot;</code>')
        expect(union).toContain('<h3>Variant 3 <code>&quot;Writing&quot;</code></h3>')
        expect(union).toContain('<tr id="AnyFeature.3.text"')
    })

    it('labels each kind of definition', () => {
        expect(section('hole')).toContain('<span class="kind">alias</span>')
        expect(section('hole')).toContain('Same as')
        expect(section('Quantity-px-in')).toContain('<span class="kind">number</span>')
        expect(section('Certainty')).toContain('<span class="kind">enumeration</span>')
        expect(section('Certainty')).toContain('<li><code>&quot;likely&quot;</code></li>')
        expect(section('Siglum')).toContain('<span class="kind">constant</span>')
        expect(section('Sigla')).toContain('array of string')
        expect(section('Anything')).toContain('<span class="kind">any</span>')
    })

    it('parenthesises alternatives inside an array', () => {
        expect(row('RollCopy.features')).toContain('array of (<a href="#AnyFeature">AnyFeature</a> | <code>&quot;none&quot;</code>)')
    })

    it('shows ontology terms, examples and usages', () => {
        expect(section('Edition')).toContain(
            '<p class="ontology">Maps to <a href="https://cidoc-crm.org/extensions/lrmoo/html/LRMoo_v1.0.html#F2">lrmoo:F2</a> Expression</p>')
        expect(row('Edition.copies')).toContain('Maps to <a href="reo/#witness">reo:witness</a>')
        expect(row('Edition.title')).toContain('Example: <code>&quot;Träumerei&quot;</code>')
        expect(section('RollCopy')).toContain('Used in <a href="#Edition.copies"><code>Edition.<wbr>copies</code></a>')
        expect(section('Edition')).not.toContain('Used in')
    })

    it('opens with the root and keeps the reading order, without an index', () => {
        const order = doc.definitions.map(definition => page.indexOf(`<section id="${definition.anchor}"`))
        expect(order).toEqual([...order].sort((a, b) => a - b))
        expect(page).not.toContain('<nav')
    })

    it('shows the rows an array definition or a union member brings along', () => {
        expect(section('Rows')).toContain('array of object')
        expect(section('Rows')).toContain('<tr id="Rows.a"')
        expect(section('Rows')).toContain('<tr id="Rows.leaf"')
        const either = section('Either')
        expect(either.indexOf('<h3>Variant 2</h3>')).toBeGreaterThan(-1)
        expect(either.indexOf('<h3>Variant 2</h3>')).toBeLessThan(either.indexOf('<tr id="Either.2.b"'))
    })

    it('heads the rows of every union member that brings some', () => {
        const listing = section('Listing')
        const positions = ['Variant 1', '<tr id="Listing.list.1.a"', 'Variant 2', '<tr id="Listing.list.2.b"']
            .map(marker => listing.indexOf(marker))
        expect(positions[0]).toBeGreaterThan(-1)
        expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it('throws on a reference to an unknown definition', () => {
        const broken: SchemaDoc = {
            definitions: [definition('Edition', { kind: 'array', items: { kind: 'reference', name: 'Missing' } })],
        }
        expect(() => renderPage(broken, '')).toThrow(/Missing/)
    })
})
