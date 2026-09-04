import { describe, expect, it } from 'vitest'
import schema from '../src/schema.json'
import context from '../src/spec/context.json'

type Json = any

const keywords = new Set(['@id', '@type', '@value', '@annotation'])

/**
 * Every term the context defines, at any level of nesting, and
 * whether it is set to null.
 */
const definedTerms = (ctx: Json, into = new Map<string, boolean>()): Map<string, boolean> => {
    Object.entries(ctx)
        .filter(([term]) => !term.startsWith('@'))
        .forEach(([term, definition]) => {
            into.set(term, definition === null)
            if (definition && typeof definition === 'object' && definition['@context']) {
                definedTerms(definition['@context'], into)
            }
        })
    return into
}

const terms = definedTerms(context['@context'])

const resolve = (node: Json): Json => {
    if (!node?.$ref) return node
    const name = decodeURIComponent(node.$ref.replace('#/definitions/', ''))
    const definition = (schema as Json).definitions[name]
    if (!definition) throw new Error(`unresolved $ref ${node.$ref}`)
    return definition
}

/** Every property key of the schema together with the keys above it. */
const schemaKeys = (): { key: string, ancestors: string[] }[] => {
    const found: { key: string, ancestors: string[] }[] = []
    const seen = new Set<Json>()
    const walk = (node: Json, ancestors: string[]) => {
        node = resolve(node)
        if (!node || typeof node !== 'object' || seen.has(node)) return
        seen.add(node)
        Object.entries(node.properties ?? {}).forEach(([key, value]) => {
            found.push({ key, ancestors })
            walk(value, [...ancestors, key])
        })
        const branches = [node.items, ...(node.anyOf ?? []), ...(node.allOf ?? []), ...(node.oneOf ?? [])]
        branches.filter(Boolean).forEach(branch => walk(branch, ancestors))
    }
    walk(schema, [])
    return found
}

/** Every value the schema allows for `@type`. */
const typeValues = (): string[] => {
    const values = new Set<string>()
    const seen = new Set<Json>()
    const walk = (node: Json) => {
        node = resolve(node)
        if (!node || typeof node !== 'object' || seen.has(node)) return
        seen.add(node)
        const type = resolve(node.properties?.['@type'])
        if (type) {
            const collect = (t: Json) => {
                t = resolve(t)
                if (t?.const) values.add(t.const)
                t?.enum?.forEach((v: string) => values.add(v))
                t?.anyOf?.forEach(collect)
            }
            collect(type)
        }
        Object.values(node.properties ?? {}).forEach(walk)
        const branches = [node.items, ...(node.anyOf ?? []), ...(node.allOf ?? []), ...(node.oneOf ?? [])]
        branches.filter(Boolean).forEach(walk)
    }
    walk(schema)
    return [...values]
}

describe('JSON-LD context', () => {
    it('maps or nulls every key of the format', () => {
        const uncovered = schemaKeys()
            .filter(({ key }) => !keywords.has(key))
            .filter(({ key, ancestors }) =>
                !terms.has(key) && !ancestors.some(a => terms.get(a) === true))
            .map(({ key, ancestors }) => [...ancestors, key].join('.'))
        expect(uncovered).toEqual([])
    })

    it('maps every @type value to a class', () => {
        const unmapped = typeValues().filter(v => !terms.has(v) || terms.get(v) === true)
        expect(unmapped).toEqual([])
    })

    it('has no default vocabulary at the top level', () => {
        expect(context['@context']).not.toHaveProperty('@vocab')
    })

    it('uses only declared prefixes', () => {
        const prefixes = new Set(
            Object.entries(context['@context'])
                .filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v))
                .map(([k]) => k)
        )
        const ids: string[] = []
        const collect = (ctx: Json) => Object.entries(ctx)
            .filter(([term]) => !term.startsWith('@'))
            .forEach(([, definition]) => {
                const id = typeof definition === 'string' ? definition : definition?.['@id']
                if (id) ids.push(id)
                if (definition?.['@context']) collect(definition['@context'])
            })
        collect(context['@context'])
        const undeclared = ids
            .filter(id => !id.startsWith('@') && !/^https?:\/\//.test(id))
            .filter(id => !prefixes.has(id.split(':')[0]))
        expect(undeclared).toEqual([])
    })
})
