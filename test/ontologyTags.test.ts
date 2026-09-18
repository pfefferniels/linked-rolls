import { describe, expect, it } from 'vitest'
import schema from '../src/schema.json'
import context from '../src/spec/context.json'
import { resolve } from './schema'

/**
 * The `@see` tags in the TSDoc name the ontology term each key and
 * class maps to. This checks them against what the JSON-LD context
 * actually does, following the same scoping rules a processor applies.
 */

type Json = any
const ctx: Json = context['@context']

/** "crm:P14 carried out by" and "crm:P14_carried_out_by" both reduce to "crm:P14". */
const codeOf = (term: string): string => {
    const [prefix, local] = term.split(':')
    return `${prefix}:${local.split(/[_ ]/)[0]}`
}

const cited = (ontology?: string): string[] =>
    ontology ? ontology.split(',').map(t => codeOf(t.trim())).sort() : []

const iriOf = (definition: Json): string | null | undefined =>
    definition === null ? null : typeof definition === 'string' ? definition : definition?.['@id']

const lookup = (term: string, scopes: Json[]): Json => {
    const scope = [...scopes].reverse().find(scope => term in scope)
    return scope ? scope[term] : ctx[term]
}

const typeValues = (node: Json): string[] => {
    if (node.properties?.['@value']) return []   // a datatype, not a class
    const values: string[] = []
    const collect = (t: Json) => {
        t = resolve(t)
        if (!t) return
        if (t.const) values.push(t.const)
        t.enum?.forEach((v: string) => values.push(v))
        t.anyOf?.forEach(collect)
    }
    collect(node.properties?.['@type'])
    return values
}

type Mismatch = { at: string, cited: string[], mapped: string[] }

const compare = (): Mismatch[] => {
    const mismatches: Mismatch[] = []
    const seen = new Set<Json>()

    const checkClass = (node: Json, scopes: Json[], path: string) => {
        const expected = cited(node.ontology)
        if (!expected.length) return
        const types = [node, ...(node.anyOf ?? []).map(resolve)].flatMap(typeValues)
        if (!types.length) return
        const mapped = [...new Set(types.map(t => iriOf(lookup(t, scopes))).filter(Boolean).map(codeOf))].sort()
        if (JSON.stringify(mapped) !== JSON.stringify(expected)) mismatches.push({ at: path, cited: expected, mapped })
    }

    // A key without any annotation lost it in the schema generator's
    // handling of Omit and Partial; only an annotated key is expected
    // to carry a tag.
    const checkProperty = (key: string, raw: Json, definition: Json, path: string, silenced: boolean) => {
        const iri = iriOf(definition)
        if (iri?.startsWith('@') || (raw.description === undefined && raw.ontology === undefined)) return
        const expected = cited(raw.ontology)
        const mapped = silenced || !iri ? [] : [codeOf(iri)]
        if (JSON.stringify(mapped) !== JSON.stringify(expected)) mismatches.push({ at: `${path}.${key}`, cited: expected, mapped })
    }

    const walk = (node: Json, scopes: Json[], path: string, silenced: boolean) => {
        node = resolve(node)
        if (!node || typeof node !== 'object' || seen.has(node)) return
        seen.add(node)
        checkClass(node, scopes, path)
        const typeScopes = typeValues(node).map(t => lookup(t, scopes)?.['@context']).filter(Boolean)
        for (const [key, raw] of Object.entries<Json>(node.properties ?? {})) {
            // A key the context drops takes its annotation with it, and
            // the tags inside the annotation are the generic ones every
            // assumption carries, true wherever a belief is exported.
            if (key === '@annotation') {
                if (!silenced) walk(raw, scopes, `${path}.${key}`, silenced)
                continue
            }
            if (key.startsWith('@')) continue
            const definition = lookup(key, [...scopes, ...typeScopes])
            checkProperty(key, raw, definition, path, silenced)
            const scoped = definition?.['@context']
            walk(raw, scoped ? [...scopes, scoped] : scopes, `${path}.${key}`, silenced || iriOf(definition) === null)
        }
        const branches = [node.items, ...(node.anyOf ?? []), ...(node.allOf ?? []), ...(node.oneOf ?? [])]
        branches.filter(Boolean).forEach(branch => walk(branch, scopes, path, silenced))
    }

    walk(schema, [], 'Edition', false)
    return mismatches
}

describe('ontology tags in the docs', () => {
    it('agree with the JSON-LD context', () => {
        expect(compare()).toEqual([])
    })
})
