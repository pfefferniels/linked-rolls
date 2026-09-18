import type { Definition, Json, Literal, OntologyTerm, Primitive, Property, SchemaDoc, TypeExpression, Usage } from './model.ts'
import { ontologyTerms } from './ontology.ts'

type Node = { [key: string]: Json }

type Names = ReadonlySet<string>

/** Where a node sits: its JSON pointer, and the anchor of the definition or property it belongs to. */
type Place = { pointer: string, anchor: string }

type ReadDefinition = Omit<Definition, 'usedIn'>

type Kind = TypeExpression['kind']

const rootKeywords = ['$ref', '$schema', 'definitions']
// `deprecated` comes from an @deprecated tag. The description beside it
// says what stands in its place.
const definitionAnnotations = ['description', 'ontology', 'deprecated']
const propertyAnnotations = [...definitionAnnotations, 'examples']
const primitives: Primitive[] = ['string', 'number', 'integer', 'boolean', 'null']
const definitionsPrefix = '#/definitions/'

const keywordsOf: Record<Kind, string[]> = {
    // The generator copies Date's format onto a reference to it; the
    // referenced definition says what the value is, so format is ignored.
    reference: ['$ref', 'format'],
    union: ['anyOf'],
    literal: ['const', 'type'],
    enumeration: ['enum', 'type'],
    object: ['type', 'properties', 'required'],
    array: ['type', 'items'],
    primitive: ['type', 'format'],
    any: [],
}

/** Everything the format documentation shows, read from the schema. */
export function readSchemaDoc(schema: Json): SchemaDoc {
    const root = asNode(schema, '')
    rejectUnexpectedKeywords(root, rootKeywords, '')
    const nodes = asNode(root.definitions, pointerTo('', 'definitions'))
    const names = new Set(Object.keys(nodes))
    const definitions = Object.entries(nodes).map(([name, node]) => readDefinition(names, name, node))
    ensureUniqueAnchors(definitions)
    const rootName = referencedName(names, root.$ref, '')
    return { definitions: withUsages(readingOrder(definitions, rootName)) }
}

const fail = (pointer: string, message: string, cause?: unknown): never => {
    throw new Error(`#${pointer}: ${message}`, { cause })
}

const pointerTo = (pointer: string, ...segments: string[]): string =>
    [pointer, ...segments.map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'))].join('/')

const isNode = (value: Json | undefined): value is Node =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const asNode = (value: Json | undefined, pointer: string): Node =>
    isNode(value) ? value : fail(pointer, 'expected an object')

const asArray = (value: Json | undefined, pointer: string): Json[] =>
    Array.isArray(value) ? value : fail(pointer, 'expected an array')

const asString = (value: Json | undefined, pointer: string): string =>
    typeof value === 'string' ? value : fail(pointer, 'expected a string')

const isLiteral = (value: Json | undefined): value is Literal =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const asLiteral = (value: Json | undefined, pointer: string): Literal =>
    isLiteral(value) ? value : fail(pointer, 'expected a string, number or boolean')

const asPrimitive = (value: Json | undefined, pointer: string): Primitive =>
    primitives.find(primitive => primitive === value) ?? fail(pointer, `expected one of ${primitives.join(', ')}`)

const asBoolean = (value: Json | undefined, pointer: string): boolean =>
    typeof value === 'boolean' ? value : fail(pointer, 'expected a boolean')

const rejectUnexpectedKeywords = (node: Node, allowed: string[], pointer: string) => {
    const unexpected = Object.keys(node).find(key => !allowed.includes(key))
    if (unexpected !== undefined) fail(pointer, `unexpected keyword "${unexpected}"`)
}

const anchorOf = (name: string): string =>
    name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

const referencedName = (names: Names, ref: Json | undefined, pointer: string): string => {
    const at = pointerTo(pointer, '$ref')
    const value = asString(ref, at)
    if (!value.startsWith(definitionsPrefix)) fail(at, `"${value}" does not point into the definitions`)
    const name = decodeURIComponent(value.slice(definitionsPrefix.length))
    return names.has(name) ? name : fail(at, `unresolved reference "${value}"`)
}

const descriptionOf = (node: Node, pointer: string): string | undefined =>
    node.description === undefined ? undefined : asString(node.description, pointerTo(pointer, 'description'))

const deprecatedIn = (node: Node, pointer: string): boolean =>
    node.deprecated !== undefined && asBoolean(node.deprecated, pointerTo(pointer, 'deprecated'))

const examplesOf = (node: Node, pointer: string): Json[] =>
    node.examples === undefined ? [] : asArray(node.examples, pointerTo(pointer, 'examples'))

const ontologyOf = (node: Node, pointer: string): OntologyTerm[] => {
    if (node.ontology === undefined) return []
    const at = pointerTo(pointer, 'ontology')
    const tag = asString(node.ontology, at)
    try {
        return ontologyTerms(tag)
    } catch (error) {
        return fail(at, (error as Error).message, error)
    }
}

const readDefinition = (names: Names, name: string, value: Json): ReadDefinition => {
    const pointer = pointerTo('', 'definitions', name)
    const node = asNode(value, pointer)
    const anchor = anchorOf(name)
    return {
        name,
        anchor,
        deprecated: deprecatedIn(node, pointer),
        description: descriptionOf(node, pointer),
        ontology: ontologyOf(node, pointer),
        type: readType(names, node, { pointer, anchor }, definitionAnnotations),
    }
}

const kindOf = (node: Node): Kind =>
    '$ref' in node ? 'reference'
        : 'anyOf' in node ? 'union'
        : 'const' in node ? 'literal'
        : 'enum' in node ? 'enumeration'
        : node.type === 'object' ? 'object'
        : node.type === 'array' ? 'array'
        : 'type' in node ? 'primitive'
        : 'any'

const readType = (names: Names, node: Node, place: Place, annotations: string[]): TypeExpression => {
    const kind = kindOf(node)
    rejectUnexpectedKeywords(node, [...keywordsOf[kind], ...annotations], place.pointer)
    switch (kind) {
        case 'reference':
            return { kind, name: referencedName(names, node.$ref, place.pointer) }
        case 'union':
            return { kind, members: readMembers(names, node, place) }
        case 'literal':
            rejectNonPrimitiveType(node, place.pointer)
            return { kind, value: asLiteral(node.const, pointerTo(place.pointer, 'const')) }
        case 'enumeration': {
            rejectNonPrimitiveType(node, place.pointer)
            const pointer = pointerTo(place.pointer, 'enum')
            return { kind, values: asArray(node.enum, pointer).map((value, index) => asLiteral(value, pointerTo(pointer, `${index}`))) }
        }
        case 'object':
            return { kind, properties: readProperties(names, node, place) }
        case 'array': {
            const pointer = pointerTo(place.pointer, 'items')
            return { kind, items: readType(names, asNode(node.items, pointer), { pointer, anchor: place.anchor }, []) }
        }
        case 'primitive': {
            const type = asPrimitive(node.type, pointerTo(place.pointer, 'type'))
            return node.format === undefined
                ? { kind, type }
                : { kind, type, format: asString(node.format, pointerTo(place.pointer, 'format')) }
        }
        case 'any':
            return { kind }
    }
}

const rejectNonPrimitiveType = (node: Node, pointer: string) => {
    if (node.type !== undefined) asPrimitive(node.type, pointerTo(pointer, 'type'))
}

const readMembers = (names: Names, node: Node, place: Place): TypeExpression[] => {
    const pointer = pointerTo(place.pointer, 'anyOf')
    return asArray(node.anyOf, pointer).map((value, index) => {
        const memberPointer = pointerTo(pointer, `${index}`)
        const member = asNode(value, memberPointer)
        return readType(names, member, { pointer: memberPointer, anchor: `${place.anchor}.${index + 1}` }, [])
    })
}

const readProperties = (names: Names, node: Node, place: Place): Property[] => {
    const propertiesPointer = pointerTo(place.pointer, 'properties')
    const properties = asNode(node.properties, propertiesPointer)
    const requiredPointer = pointerTo(place.pointer, 'required')
    const required = node.required === undefined
        ? []
        : asArray(node.required, requiredPointer).map((name, index) => asString(name, pointerTo(requiredPointer, `${index}`)))
    const stray = required.find(name => !Object.hasOwn(properties, name))
    if (stray !== undefined) fail(requiredPointer, `"${stray}" is not a property`)
    return Object.entries(properties).map(([name, value]) => {
        const pointer = pointerTo(propertiesPointer, name)
        const property = asNode(value, pointer)
        const anchor = `${place.anchor}.${name}`
        return {
            name,
            anchor,
            required: required.includes(name),
            deprecated: deprecatedIn(property, pointer),
            description: descriptionOf(property, pointer),
            ontology: ontologyOf(property, pointer),
            examples: examplesOf(property, pointer),
            type: readType(names, property, { pointer, anchor }, propertyAnnotations),
        }
    })
}

/** Every property within a type, each before the properties inside it. */
export const propertiesIn = (type: TypeExpression): Property[] => {
    switch (type.kind) {
        case 'array': return propertiesIn(type.items)
        case 'union': return type.members.flatMap(propertiesIn)
        case 'object': return type.properties.flatMap(property => [property, ...propertiesIn(property.type)])
        default: return []
    }
}

const ensureUniqueAnchors = (definitions: ReadDefinition[]) => {
    const anchors = definitions.flatMap(definition => [definition.anchor, ...propertiesIn(definition.type).map(property => property.anchor)])
    const duplicate = anchors.find((anchor, index) => anchors.indexOf(anchor) !== index)
    if (duplicate !== undefined) throw new Error(`the anchor "${duplicate}" is not unique`)
}

/** A definition named within a type, with the innermost property naming it, if any. */
type Reference = { name: string, property?: Property }

const referencesIn = (type: TypeExpression, property?: Property): Reference[] => {
    switch (type.kind) {
        case 'reference': return [{ name: type.name, property }]
        case 'array': return referencesIn(type.items, property)
        case 'union': return type.members.flatMap(member => referencesIn(member, property))
        case 'object': return type.properties.flatMap(inner => referencesIn(inner.type, inner))
        default: return []
    }
}

/** Every name reachable from the start, in breadth-first order. */
const breadthFirst = (start: string, next: (name: string) => string[]): string[] => {
    const grow = (order: string[], index: number): string[] =>
        index === order.length
            ? order
            : grow([...order, ...new Set(next(order[index]).filter(name => !order.includes(name)))], index + 1)
    return grow([start], 0)
}

const readingOrder = (definitions: ReadDefinition[], root: string): ReadDefinition[] => {
    const byName = new Map(definitions.map(definition => [definition.name, definition]))
    const reachable = breadthFirst(root, name => referencesIn(byName.get(name)!.type).map(reference => reference.name))
    const unreachable = definitions.filter(definition => !reachable.includes(definition.name))
    return [...reachable.map(name => byName.get(name)!), ...unreachable]
}

const usageIn = (definition: ReadDefinition, property?: Property): Usage =>
    property === undefined
        ? { label: definition.name, anchor: definition.anchor }
        // A property's anchor is its definition's anchor followed by the path to it.
        : { label: definition.name + property.anchor.slice(definition.anchor.length), anchor: property.anchor }

const uniqueUsages = (usages: Usage[]): Usage[] =>
    usages.filter((usage, index) => usages.findIndex(other => other.anchor === usage.anchor) === index)

const withUsages = (definitions: ReadDefinition[]): Definition[] => {
    const references = definitions.flatMap(definition =>
        referencesIn(definition.type).map(({ name, property }) => ({ name, usage: usageIn(definition, property) })))
    return definitions.map(definition => ({
        ...definition,
        usedIn: uniqueUsages(references.filter(reference => reference.name === definition.name).map(reference => reference.usage)),
    }))
}
