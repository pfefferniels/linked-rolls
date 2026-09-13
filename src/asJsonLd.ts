import { Edition } from "./Edition";
import { systemIdIn } from "./TrackerBar";
import { certaintyOf, isAsserted } from "./Assumption";
import context from "./spec/context.json";

export const exportDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const asJsonLdEntity = (obj: object) => {
    if (obj instanceof Date) {
        return exportDate(obj)
    }

    const result: any = {}

    if ('asJSON' in obj && typeof obj['asJSON'] === 'function') {
        return asJsonLdEntity(obj['asJSON']())
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'function' || typeof value === 'undefined') {
            // ignore
        }
        else if (key === 'type') {
            result['@type'] = value
        }
        else if (key === 'id') {
            result['@id'] = value
        }
        else if (Array.isArray(value)) {
            result[key] = value.map(v => (typeof v === 'object') ? asJsonLdEntity(v) : v)
        }
        else if (typeof value === 'object') {
            result[key] = asJsonLdEntity(value)
        }
        else {
            result[key] = value
        }
    }

    if ('@value' in obj && obj['@value'] instanceof Date) {
        result['@type'] = 'xsd:date'
    }

    return result
}

/**
 * Gives every version the context of its own reproducing system, which
 * reads its expression types as that system's terms.
 *
 * It sits on the version rather than on the edition because one edition
 * may hold versions of several systems, and each system's context
 * defines `expressionType` with its own `@vocab`. Two of them in one
 * context array would leave every expression type in the document
 * reading as whichever came last. An embedded context merges with the
 * active one, so the shared prefixes survive.
 */
const withSystemContexts = (node: any): any => {
    if (Array.isArray(node)) return node.map(withSystemContexts)
    if (node === null || typeof node !== 'object') return node

    const walked = Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, withSystemContexts(value)])
    )

    const system = node['@type'] === 'Version'
        ? systemIdIn(node.system?.['@id'])
        : undefined

    return system
        ? { '@context': `https://w3id.org/reo/${system}/context.jsonld`, ...walked }
        : walked
}

type Json = any

const isRecord = (value: unknown): value is Record<string, Json> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

/** Terms the context sets to null, which say nothing when the edition is read as RDF. */
const silentTerms = new Set(
    Object.entries(context['@context'])
        .filter(([, definition]) => definition === null)
        .map(([term]) => term))

/**
 * A reference its belief does not hold to be so: it names a node, states
 * nothing RDF would read besides, and its belief is below likely.
 */
const isDoubtedReference = (value: unknown): value is Record<string, Json> =>
    isRecord(value)
    && typeof value['@id'] === 'string'
    && isRecord(value['@annotation'])
    && !isAsserted(certaintyOf(value))
    && Object.keys(value).every(key => key === '@id' || key === '@annotation' || silentTerms.has(key))

/**
 * The statement a doubted reference makes, as a JSON-LD-star embedded
 * node: the triple is named without being stated, and the belief is
 * about it. The annotation's own id goes along under a key RDF does not
 * read, so that an import can put it back.
 */
const quote = (subject: string, key: string, reference: Record<string, Json>, listed: boolean): Json => {
    const { '@annotation': { '@id': annotation, ...about }, ...object } = reference
    return { '@id': { '@id': subject, [key]: listed ? [object] : object }, annotation, ...about }
}

type Quoting = { readonly node: Json, readonly quoted: readonly Json[] }

/** The value a node states under a key, less the doubted references, and those references quoted. */
const quotingValue = (subject: string, key: string, value: Json): Quoting => {
    if (Array.isArray(value)) {
        return {
            node: value.filter(item => !isDoubtedReference(item)),
            quoted: value.filter(isDoubtedReference).map(item => quote(subject, key, item, true))
        }
    }
    return isDoubtedReference(value)
        ? { node: undefined, quoted: [quote(subject, key, value, false)] }
        : { node: value, quoted: [] }
}

/**
 * The document with every doubted reference taken off the node that
 * states it, and quoted instead.
 *
 * An `@annotation` in JSON-LD-star states the triple it annotates and
 * then says something about it, so a statement the edition holds
 * possible, unlikely or false would reach RDF as a fact. Only references
 * between nodes are quoted, since only they can be put back where they
 * stood; a doubted date or attribution stays annotated in place.
 */
const withDoubtedReferencesQuoted = (value: Json): Quoting => {
    if (Array.isArray(value)) {
        const quotings = value.map(withDoubtedReferencesQuoted)
        return { node: quotings.map(({ node }) => node), quoted: quotings.flatMap(({ quoted }) => quoted) }
    }
    if (!isRecord(value)) return { node: value, quoted: [] }

    const subject = value['@id']
    const entries = Object.entries(value).map(([key, child]) => {
        const own: Quoting = typeof subject === 'string' && !key.startsWith('@')
            ? quotingValue(subject, key, child)
            : { node: child, quoted: [] }
        const below = withDoubtedReferencesQuoted(own.node)
        return { key, node: below.node, quoted: [...own.quoted, ...below.quoted] }
    })

    return {
        node: Object.fromEntries(entries.filter(({ node }) => node !== undefined).map(({ key, node }) => [key, node])),
        quoted: entries.flatMap(({ quoted }) => quoted)
    }
}

export const asJsonLd = (edition: Edition) => {
    const { node, quoted } = withDoubtedReferencesQuoted(withSystemContexts(asJsonLdEntity(edition)))
    // The context is the export's own; one carried in from an import must not override it.
    const { base, '@context': carried, ...rest } = node

    return {
        '@context': [
            'https://w3id.org/reo/context.jsonld',
            {
                '@base': edition.base
            }
        ],
        '@type': "Edition",
        '@id': edition.base,
        ...rest,
        ...(quoted.length > 0 && { '@included': quoted })
    }
}
