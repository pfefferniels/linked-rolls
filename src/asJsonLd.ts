import { Edition } from "./Edition.js";
import { systemIdIn } from "./TrackerBar.js";
import { certaintyOf, isAsserted } from "./Assumption.js";
import context from "./spec/context.json" with { type: 'json' };

/**
 * The keys an export derives from the tree, which no node of the
 * edition states itself. An import reads them off again.
 */
export const derivedKeys: ReadonlySet<string> = new Set(['bears', 'composedOf', 'augmented', 'diminished']);

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

const nodesIn = (value: Json): Json[] =>
    Array.isArray(value) ? value.filter(isRecord) : []

/** What the acts of a copy brought onto it: the features they produced and the patches they glued on. */
const madeOn = (copy: Json): Json[] => [
    ...nodesIn(copy.production?.produced),
    ...nodesIn(copy.modifications).flatMap(act => [...nodesIn(act.produced), ...nodesIn(act.added)])
]

const referencing = (nodes: Json[], patches: boolean): Json[] =>
    nodes.filter(node => (node['@type'] === 'GluedOn') === patches && typeof node['@id'] === 'string')
        .map(node => ({ '@id': node['@id'] }))

const featuresAmong = (nodes: Json[]): Json[] => referencing(nodes, false)

const patchesAmong = (nodes: Json[]): Json[] => referencing(nodes, true)

/** The key, where there is anything to state under it. */
const stating = (key: string, references: Json[]): Json => references.length > 0 ? { [key]: references } : {}

/** The act with what it changed named: an attachment augments the copy, a removal diminishes it. */
const changing = (copyId: Json) => (act: Json): Json => {
    if (typeof copyId !== 'string' || !isRecord(act)) return act
    if (act['@type'] === 'Attachment') return { ...act, augmented: { '@id': copyId } }
    if (act['@type'] === 'Removal') return { ...act, diminished: { '@id': copyId } }
    return act
}

/**
 * The document with every bearing stated that its tree only implies. A
 * copy bears the features its acts brought about and is composed of the
 * patches they glued on, a patch bears the features glued onto it in
 * turn. Each feature stands in the act that made it and nothing reads a
 * bearing off that, so the export states it; a patch is no feature, and
 * P56 bears feature takes only features, so a patch is stated as a part.
 */
const withBearings = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(withBearings)
    if (!isRecord(value)) return value

    const node = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withBearings(child)]))

    if (node['@type'] === 'RollCopy') {
        const made = madeOn(node)
        return {
            ...node,
            ...(Array.isArray(node.modifications) && { modifications: node.modifications.map(changing(node['@id'])) }),
            ...stating('bears', featuresAmong(made)),
            ...stating('composedOf', patchesAmong(made))
        }
    }
    if (node['@type'] === 'GluedOn') return { ...node, ...stating('bears', featuresAmong(nodesIn(node.features))) }
    return node
}

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
    const { node, quoted } = withDoubtedReferencesQuoted(withSystemContexts(withBearings(asJsonLdEntity(edition))))
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
