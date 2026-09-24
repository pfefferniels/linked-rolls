import { Edition } from "../model/Edition.js";
import { derivedKeys } from "./asJsonLd.js";
import { migrate, plainCopyId } from "./migrate.js";
import { isDateString } from "../shared/utils.js";
import schema from "../schema.json" with { type: 'json' };

export const importDate = (str: string): Date => {
    const [y, m, d] = str.split('-').map(s => parseInt(s, 10))
    if ([y, m, d].some(n => isNaN(n))) {
        throw new Error(`Invalid date format: "${str}". Expected "YYYY-MM-DD".`)
    }
    return new Date(y, m - 1, d)
}

type Json = any

/** The names of the properties the schema holds dates under, wherever they stand in it. */
const dateKeysIn = (node: Json, keys = new Set<string>()): Set<string> => {
    if (Array.isArray(node)) node.forEach(item => dateKeysIn(item, keys))
    else if (node !== null && typeof node === 'object') {
        Object.entries(node).forEach(([key, value]) => {
            if (key === 'properties' && value !== null && typeof value === 'object') {
                Object.entries(value as Record<string, Json>)
                    .filter(([, property]) => property?.format === 'date')
                    .forEach(([name]) => keys.add(name))
            }
            dateKeysIn(value, keys)
        })
    }
    return keys
}

/**
 * The keys a date is read under. Only these: a string elsewhere that
 * happens to read like a date, such as the transcription of a dated
 * label, is text and stays text.
 */
const dateKeys: ReadonlySet<string> = dateKeysIn(schema)

/** A value as the edition holds it under the key: a date read, an entity converted, anything else as it stands. */
const fromJsonLdValue = (key: string, value: Json): Json => {
    if (typeof value === 'string') return dateKeys.has(key) && isDateString(value) ? importDate(value) : value
    if (Array.isArray(value)) return value.map(item => fromJsonLdValue(key, item))
    if (value !== null && typeof value === 'object') return fromJsonLdEntity(value)
    return value
}

/** A node without what the export derived from it: what an act changed follows from where the act stands. */
const asStated = (json: Record<string, Json>): Record<string, Json> =>
    Object.keys(json).some(key => derivedKeys.has(key))
        ? Object.fromEntries(Object.entries(json).filter(([key]) => !derivedKeys.has(key)))
        : json

/**
 * An entity with its keywords read as plain keys. The input is left as
 * it is. The `@type` of a value object names the datatype of the value,
 * not a class, and is dropped. So is a context: a version carries one
 * naming its system's vocabulary, and it belongs to the serialisation
 * rather than to the edition, which states the system as data.
 */
const fromJsonLdEntity = (json: Record<string, Json>): Record<string, Json> => {
    const { '@type': type, '@id': id, '@context': context, ...rest } = asStated(json)
    const entity = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, fromJsonLdValue(key, value)]))
    if (type !== undefined && !('@value' in json)) entity.type = type
    if (id !== undefined) entity.id = id
    return entity
}

// Every entity is named by its id alone. Documents written before that was so
// prefixed a copy's with `copy/`, and are read here as though they had not.
const withPlainCopyIds = (json: Json) => ({
    ...json,
    copies: (json.copies ?? []).map((copy: Json) => ({
        ...copy,
        '@id': typeof copy['@id'] === 'string' ? plainCopyId(copy['@id']) : copy['@id']
    }))
})

/** A statement an export quoted rather than stated: an included node whose id is a triple. */
const isQuotedStatement = (node: Json): boolean =>
    node !== null && typeof node === 'object' && node['@id'] !== null && typeof node['@id'] === 'object'

interface QuotedReference {
    subject: string
    key: string
    listed: boolean
    reference: Json
}

/** The reference a quoted statement made, annotated again with the belief the export set beside it. */
const referenceOf = (statement: Json): QuotedReference => {
    const { '@id': { '@id': subject, ...made }, annotation, ...about } = statement
    const [key, value] = Object.entries<Json>(made)[0]
    const listed = Array.isArray(value)
    return {
        subject,
        key,
        listed,
        reference: {
            ...(listed ? value[0] : value),
            '@annotation': { ...(annotation !== undefined && { '@id': annotation }), ...about }
        }
    }
}

/** Whether the object states anything beside its id, which a reference to a node does not. */
const isNode = (value: Json): boolean =>
    typeof value['@id'] === 'string' && Object.keys(value).some(key => key !== '@id' && key !== '@annotation')

/** The document with each quoted reference back on the node that makes it. */
const withReferencesOn = (value: Json, bySubject: ReadonlyMap<string, QuotedReference[]>): Json => {
    if (Array.isArray(value)) return value.map(item => withReferencesOn(item, bySubject))
    if (!value || typeof value !== 'object') return value

    const walked = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withReferencesOn(child, bySubject)]))
    const references = isNode(value)
        ? bySubject.get(value['@id']) ?? []
        : []
    return references.reduce((node: Json, { key, listed, reference }) =>
        ({ ...node, [key]: listed ? [...(node[key] ?? []), reference] : reference }), walked)
}

/**
 * Puts back what an export quoted. A reference the edition doubts goes
 * out as a JSON-LD-star embedded node beside the document, so that RDF
 * does not state it; in the edition it belongs on the node that makes
 * it, under its belief. In a list it comes back after the references
 * that were stated.
 */
const withQuotedStatementsInPlace = (edition: Json): Json => {
    const included: Json[] = Array.isArray(edition['@included']) ? edition['@included'] : []
    const statements = included.filter(isQuotedStatement)
    if (statements.length === 0) return edition

    const others = included.filter(node => !isQuotedStatement(node))
    const { '@included': _quoted, ...rest } = edition
    const bySubject = Map.groupBy(statements.map(referenceOf), ({ subject }) => subject)
    return withReferencesOn({ ...rest, ...(others.length > 0 && { '@included': others }) }, bySubject)
}

export const importJsonLd = (json: Json): Edition => {
    const { '@context': context, formatVersion: _revision, ...document } = withPlainCopyIds(migrate(withQuotedStatementsInPlace(json)))
    const edition = fromJsonLdEntity(document) as Edition;
    edition.base = Array.isArray(context)
        ? context.find((c: Json) => c['@base'])?.['@base'] || ''
        : '';

    return edition;
}
