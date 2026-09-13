import { describe, expect, it } from 'vitest'
import schema from '../src/schema.json'
import type { Definition, Json, Property, SchemaDoc, TypeExpression } from '../schema/docs/model.ts'
import { ontologyTerms } from '../schema/docs/ontology.ts'
import { propertiesIn, readSchemaDoc } from '../schema/docs/read.ts'

const refTo = (name: string) => `#/definitions/${encodeURIComponent(name)}`

const schemaWith = (definitions: { [name: string]: Json }, root = Object.keys(definitions)[0]): Json => ({
    $ref: refTo(root),
    $schema: 'http://json-schema.org/draft-07/schema#',
    definitions,
})

const read = (definitions: { [name: string]: Json }, root?: string) => readSchemaDoc(schemaWith(definitions, root))

const named = (doc: SchemaDoc, name: string): Definition => {
    const definition = doc.definitions.find(d => d.name === name)
    if (!definition) throw new Error(`no definition ${name}`)
    return definition
}

const typeOf = (node: Json): TypeExpression => read({ Root: node }).definitions[0].type

const propertiesOf = (type: TypeExpression): Property[] => {
    if (type.kind !== 'object') throw new Error(`expected an object, got ${type.kind}`)
    return type.properties
}

const anchorsIn = (type: TypeExpression): string[] => propertiesIn(type).map(property => property.anchor)

describe('ontologyTerms', () => {
    it('reads a term with its label', () => {
        expect(ontologyTerms('crm:P14 carried out by')).toEqual([
            { curie: 'crm:P14', label: 'carried out by', url: 'https://cidoc-crm.org/html/cidoc_crm_v7.1.3.html#P14' },
        ])
    })

    it('reads a term without a label', () => {
        const [term] = ontologyTerms('rdfs:label')
        expect(term).toEqual({ curie: 'rdfs:label', url: 'https://www.w3.org/2000/01/rdf-schema#label' })
        expect(term).not.toHaveProperty('label')
    })

    it('reads several terms separated by commas', () => {
        expect(ontologyTerms('crm:E79 Part Addition, crm:E80 Part Removal').map(term => [term.curie, term.label]))
            .toEqual([['crm:E79', 'Part Addition'], ['crm:E80', 'Part Removal']])
    })

    it('links reo terms to the ontology page beside the docs', () => {
        expect(ontologyTerms('reo:witness')[0].url).toBe('reo/#witness')
    })

    it('rejects an unknown prefix', () => {
        expect(() => ontologyTerms('foaf:name')).toThrow('unknown ontology prefix "foaf"')
        expect(() => ontologyTerms('constructor:name')).toThrow('unknown ontology prefix')
    })

    it('rejects a malformed term', () => {
        expect(() => ontologyTerms('P14 carried out by')).toThrow('malformed')
        expect(() => ontologyTerms('crm:')).toThrow('malformed')
        expect(() => ontologyTerms('')).toThrow('malformed')
        expect(() => ontologyTerms('crm:P14,')).toThrow('malformed')
    })
})

describe('readSchemaDoc: types', () => {
    it('reads a reference, decoding the name as a whole', () => {
        const doc = read({ Root: { $ref: refTo('Quantity<"px/in">') }, 'Quantity<"px/in">': { type: 'number' } })
        expect(named(doc, 'Root').type).toEqual({ kind: 'reference', name: 'Quantity<"px/in">' })
    })

    it('ignores a format beside a reference', () => {
        const doc = read({ Root: { $ref: refTo('Day'), format: 'date' }, Day: { type: 'string' } })
        expect(named(doc, 'Root').type).toEqual({ kind: 'reference', name: 'Day' })
    })

    it('reads a union', () => {
        const doc = read({ Root: { anyOf: [{ $ref: refTo('A') }, { const: 'b', type: 'string' }] }, A: { type: 'string' } })
        expect(named(doc, 'Root').type).toEqual({
            kind: 'union',
            members: [{ kind: 'reference', name: 'A' }, { kind: 'literal', value: 'b' }],
        })
    })

    it('reads a literal with or without its type', () => {
        expect(typeOf({ const: 'Version', type: 'string' })).toEqual({ kind: 'literal', value: 'Version' })
        expect(typeOf({ const: 3 })).toEqual({ kind: 'literal', value: 3 })
    })

    it('reads an enumeration', () => {
        expect(typeOf({ enum: ['bass', 'treble'], type: 'string' })).toEqual({ kind: 'enumeration', values: ['bass', 'treble'] })
    })

    it('reads an array', () => {
        expect(typeOf({ type: 'array', items: { type: 'string' } })).toEqual({ kind: 'array', items: { kind: 'primitive', type: 'string' } })
    })

    it('reads a primitive with or without a format', () => {
        expect(typeOf({ type: 'number' })).toEqual({ kind: 'primitive', type: 'number' })
        expect(typeOf({ type: 'string', format: 'date' })).toEqual({ kind: 'primitive', type: 'string', format: 'date' })
    })

    it('reads a node without a type as any', () => {
        const [property] = propertiesOf(typeOf({ type: 'object', properties: { '@id': { description: 'An id.' } } }))
        expect(property.type).toEqual({ kind: 'any' })
        expect(property.description).toBe('An id.')
    })

    it('reads an object, keeping the order of its properties', () => {
        const properties = propertiesOf(typeOf({
            type: 'object',
            properties: { b: { type: 'string' }, a: { type: 'number' } },
            required: ['a'],
        }))
        expect(properties.map(p => [p.name, p.required])).toEqual([['b', false], ['a', true]])
    })

    it('reads an object without required keys', () => {
        const properties = propertiesOf(typeOf({ type: 'object', properties: { a: { type: 'string' } } }))
        expect(properties[0].required).toBe(false)
    })
})

describe('readSchemaDoc: annotations', () => {
    it('reads the description, ontology and examples of a property', () => {
        const [property] = propertiesOf(typeOf({
            type: 'object',
            properties: {
                title: { type: 'string', description: 'The title.', ontology: 'dcterms:title', examples: ['Träumerei'] },
            },
        }))
        expect(property).toEqual({
            name: 'title',
            anchor: 'Root.title',
            required: false,
            description: 'The title.',
            ontology: [{ curie: 'dcterms:title', url: 'https://www.dublincore.org/specifications/dublin-core/dcmi-terms#title' }],
            examples: ['Träumerei'],
            type: { kind: 'primitive', type: 'string' },
        })
    })

    it('reads the description and ontology of a definition', () => {
        const [definition] = read({ Version: { type: 'string', description: 'A version.', ontology: 'lrmoo:F2 Expression' } }).definitions
        expect(definition.description).toBe('A version.')
        expect(definition.ontology.map(term => term.curie)).toEqual(['lrmoo:F2'])
    })

    it('gives a property without annotations empty lists', () => {
        const [property] = propertiesOf(typeOf({ type: 'object', properties: { a: { type: 'string' } } }))
        expect(property.description).toBeUndefined()
        expect(property.ontology).toEqual([])
        expect(property.examples).toEqual([])
    })
})

describe('readSchemaDoc: errors', () => {
    it('names an unresolved reference', () => {
        expect(() => read({ Root: { $ref: refTo('Missing') } }))
            .toThrow('#/definitions/Root/$ref: unresolved reference "#/definitions/Missing"')
    })

    it('rejects a reference outside the definitions', () => {
        expect(() => read({ Root: { $ref: 'other.json#/Thing' } })).toThrow('does not point into the definitions')
    })

    it('names the pointer and keyword of an unknown keyword', () => {
        expect(() => typeOf({ type: 'object', properties: { a: { type: 'string', pattern: '^a' } } }))
            .toThrow('#/definitions/Root/properties/a: unexpected keyword "pattern"')
    })

    it('escapes a slash in a pointer', () => {
        expect(() => read({ 'Quantity<"px/in">': { type: 'number', minimum: 0 } }))
            .toThrow('#/definitions/Quantity<"px~1in">: unexpected keyword "minimum"')
    })

    it('rejects a type array', () => {
        expect(() => typeOf({ type: ['string', 'null'] })).toThrow('#/definitions/Root/type: expected one of')
        expect(() => typeOf({ const: 'a', type: ['string'] })).toThrow('#/definitions/Root/type')
    })

    it('rejects an items array', () => {
        expect(() => typeOf({ type: 'array', items: [{ type: 'string' }] })).toThrow('#/definitions/Root/items: expected an object')
    })

    it('rejects an object without properties', () => {
        expect(() => typeOf({ type: 'object' })).toThrow('#/definitions/Root/properties: expected an object')
    })

    it('rejects annotations outside definitions and properties', () => {
        expect(() => typeOf({ anyOf: [{ type: 'string', description: 'A string.' }] }))
            .toThrow('#/definitions/Root/anyOf/0: unexpected keyword "description"')
        expect(() => typeOf({ type: 'array', items: { type: 'string', ontology: 'rdfs:label' } }))
            .toThrow('#/definitions/Root/items: unexpected keyword "ontology"')
    })

    it('rejects examples on a definition, which the docs have no place for', () => {
        expect(() => typeOf({ type: 'string', examples: ['a'] })).toThrow('unexpected keyword "examples"')
    })

    it('rejects $schema and definitions below the root', () => {
        expect(() => typeOf({ type: 'string', $schema: 'x' })).toThrow('unexpected keyword "$schema"')
        expect(() => typeOf({ type: 'string', definitions: {} })).toThrow('unexpected keyword "definitions"')
    })

    it('rejects an unknown keyword at the root', () => {
        expect(() => readSchemaDoc({ ...(schemaWith({ Root: { type: 'string' } }) as object), title: 'x' }))
            .toThrow('#: unexpected keyword "title"')
    })

    it('rejects a required key that is not a property', () => {
        expect(() => typeOf({ type: 'object', properties: { a: { type: 'string' } }, required: ['b'] }))
            .toThrow('#/definitions/Root/required: "b" is not a property')
    })

    it('names the place of a malformed ontology tag', () => {
        expect(() => typeOf({ type: 'string', ontology: 'foaf:name' }))
            .toThrow('#/definitions/Root/ontology: unknown ontology prefix "foaf"')
    })

    it('rejects two definitions with the same anchor', () => {
        expect(() => read({ 'A b': { type: 'string' }, 'A-b': { type: 'string' } })).toThrow('the anchor "A-b" is not unique')
    })
})

describe('readSchemaDoc: anchors', () => {
    it('derives a definition anchor from its name', () => {
        expect(read({ 'Quantity<"px/in">': { type: 'number' } }).definitions[0].anchor).toBe('Quantity-px-in')
        expect(read({ 'PartialBy<AnyFeature,("horizontal"|"vertical")>': { type: 'number' } }).definitions[0].anchor)
            .toBe('PartialBy-AnyFeature-horizontal-vertical')
    })

    it('extends the anchor through inline objects, arrays and union members', () => {
        const root = read({
            Root: {
                type: 'object',
                properties: {
                    outer: { type: 'object', properties: { inner: { type: 'string' } } },
                    list: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' } } } },
                    choice: { anyOf: [{ type: 'string' }, { type: 'object', properties: { y: { type: 'string' } } }] },
                },
            },
        }).definitions[0]
        expect(anchorsIn(root.type)).toEqual([
            'Root.outer', 'Root.outer.inner', 'Root.list', 'Root.list.x', 'Root.choice', 'Root.choice.2.y',
        ])
    })

    it('numbers the inline object members of a union definition', () => {
        const root = read({
            Root: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { a: { type: 'number' } } }] },
        }).definitions[0]
        expect(anchorsIn(root.type)).toEqual(['Root.1.a', 'Root.2.a'])
    })

    it('numbers union members that are arrays of objects too', () => {
        const root = read({
            Root: {
                anyOf: [
                    { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } },
                    { type: 'array', items: { type: 'object', properties: { a: { type: 'number' } } } },
                ],
            },
        }).definitions[0]
        expect(anchorsIn(root.type)).toEqual(['Root.1.a', 'Root.2.a'])
    })
})

describe('readSchemaDoc: usages and order', () => {
    const doc = read({
        Unreachable: { $ref: refTo('Leaf') },
        Root: {
            type: 'object',
            properties: {
                b: { $ref: refTo('B') },
                c: { type: 'array', items: { $ref: refTo('C') } },
                nested: { type: 'object', properties: { again: { anyOf: [{ $ref: refTo('B') }, { type: 'array', items: { $ref: refTo('B') } }] } } },
            },
        },
        B: { $ref: refTo('D') },
        C: { anyOf: [{ $ref: refTo('E') }, { $ref: refTo('Leaf') }] },
        D: { type: 'string' },
        E: { type: 'object', properties: { leaf: { $ref: refTo('Leaf') } } },
        Leaf: { type: 'string' },
    }, 'Root')

    it('orders definitions breadth-first from the root, the unreachable last', () => {
        expect(doc.definitions.map(d => d.name)).toEqual(['Root', 'B', 'C', 'D', 'E', 'Leaf', 'Unreachable'])
    })

    it('records a property usage with its path', () => {
        expect(named(doc, 'C').usedIn).toEqual([{ label: 'Root.c', anchor: 'Root.c' }])
    })

    it('records each place once, even where it names a definition twice', () => {
        expect(named(doc, 'B').usedIn).toEqual([
            { label: 'Root.b', anchor: 'Root.b' },
            { label: 'Root.nested.again', anchor: 'Root.nested.again' },
        ])
    })

    it('records an alias target and a union member as the definition itself', () => {
        expect(named(doc, 'D').usedIn).toEqual([{ label: 'B', anchor: 'B' }])
        expect(named(doc, 'E').usedIn).toEqual([{ label: 'C', anchor: 'C' }])
    })

    it('orders usages by the reading order of the referring definitions', () => {
        expect(named(doc, 'Leaf').usedIn.map(usage => usage.label)).toEqual(['C', 'E.leaf', 'Unreachable'])
    })

    it('labels a usage by the definition name, not its anchor', () => {
        const withGeneric = read({
            'Wrapper<"px/in">': { type: 'object', properties: { value: { $ref: refTo('Leaf') } } },
            Leaf: { type: 'string' },
        })
        expect(named(withGeneric, 'Leaf').usedIn).toEqual([{ label: 'Wrapper<"px/in">.value', anchor: 'Wrapper-px-in.value' }])
    })
})

describe('readSchemaDoc on src/schema.json', () => {
    const doc = readSchemaDoc(schema as Json)

    it('starts with the edition', () => {
        expect(doc.definitions[0].name).toBe('Edition')
    })

    it('holds every definition of the schema once', () => {
        expect(doc.definitions.map(d => d.name).sort()).toEqual(Object.keys(schema.definitions).sort())
    })

    it('finds a usage for every definition but the root', () => {
        expect(doc.definitions.slice(1).filter(d => d.usedIn.length === 0).map(d => d.name)).toEqual([])
    })

    it('reads a definition whose name holds a slash', () => {
        expect(named(doc, 'Quantity<"px/in">').usedIn.length).toBeGreaterThan(0)
    })
})
