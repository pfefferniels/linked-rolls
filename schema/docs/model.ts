/** What the format documentation shows, read from src/schema.json. */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type Literal = string | number | boolean

/** A term a key or class maps to, as its @see tag names it, e.g. crm:P14 carried out by. */
export type OntologyTerm = {
    curie: string
    label?: string
    url: string
}

export type Primitive = 'string' | 'number' | 'integer' | 'boolean' | 'null'

export type TypeExpression =
    | { kind: 'reference', name: string }
    | { kind: 'primitive', type: Primitive, format?: string }
    | { kind: 'literal', value: Literal }
    | { kind: 'enumeration', values: Literal[] }
    | { kind: 'array', items: TypeExpression }
    | { kind: 'union', members: TypeExpression[] }
    | { kind: 'object', properties: Property[] }
    | { kind: 'any' }

export type Property = {
    name: string
    /** Unique on the page, e.g. RollCopy.measurements.scanResolution */
    anchor: string
    required: boolean
    /** Written while the format still carried it; the description says what stands in its place. */
    deprecated: boolean
    description?: string
    ontology: OntologyTerm[]
    examples: Json[]
    type: TypeExpression
}

/** A place that refers to a definition. */
export type Usage = {
    /** e.g. Edition.versions, or AnyFeature for a union naming it as a member */
    label: string
    anchor: string
}

export type Definition = {
    /** As in the schema, e.g. Quantity<"px/in"> */
    name: string
    anchor: string
    deprecated: boolean
    description?: string
    ontology: OntologyTerm[]
    type: TypeExpression
    usedIn: Usage[]
}

export type SchemaDoc = {
    /** The root first, then breadth-first along the references. */
    definitions: Definition[]
}
