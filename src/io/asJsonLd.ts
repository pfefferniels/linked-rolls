import { Edition } from "../model/Edition.js";
import { systemIdIn } from "../systems/TrackerBar.js";
import { certaintyOf, isAsserted } from "../model/Assumption.js";
import context from "../spec/context.json" with { type: 'json' };
import { atOwnPlaces } from "../collation/alignment.js";

/**
 * The keys an export derives from the tree, which no node of the
 * edition states itself. An import reads them off again.
 */
export const derivedKeys: ReadonlySet<string> = new Set(['augmented', 'diminished']);

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
const withSystemContext = (version: any): any => {
    const system = systemIdIn(version?.system?.['@id'])
    return system ? { '@context': `https://w3id.org/reo/${system}/context.jsonld`, ...version } : version
}

const withSystemContexts = (edition: any): any =>
    Array.isArray(edition.versions) ? { ...edition, versions: edition.versions.map(withSystemContext) } : edition

/**
 * Gives every version the act that made it, stating nothing of it where
 * nothing is known. The axioms of reo.ttl order that act in time against
 * the recording, the copies and the act that made the version it derives
 * from, and a reasoner cannot place a node the graph lacks. An import
 * drops it again where it states nothing.
 */
const withCreations = (edition: any): any =>
    Array.isArray(edition.versions)
        ? { ...edition, versions: edition.versions.map((version: any) => version.creation ? version : { ...version, creation: {} }) }
        : edition

type Json = any

const isRecord = (value: unknown): value is Record<string, Json> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

/** The act with what it changed named: an attachment augments the copy, a removal diminishes it. */
const changing = (copyId: Json) => (act: Json): Json => {
    if (typeof copyId !== 'string' || !isRecord(act)) return act
    if (act['@type'] === 'Attachment') return { ...act, augmented: { '@id': copyId } }
    if (act['@type'] === 'Removal') return { ...act, diminished: { '@id': copyId } }
    return act
}

/** The copy with what each of its acts changed stated. */
const withChangesOf = (copy: Json): Json =>
    isRecord(copy) && Array.isArray(copy.modifications)
        ? { ...copy, modifications: copy.modifications.map(changing(copy['@id'])) }
        : copy

/**
 * The document with what each act changed stated. Which of P110
 * augmented and P112 diminished applies depends on the class of the
 * act, which no property chain in OWL 2 RL can test, so the export
 * states it. What a copy or a patch bears is left to a reasoner (see
 * the entailments in reo.ttl). The copies are the only nodes that are
 * modified, and the edition holds them in its list of copies alone.
 */
const withChanges = (edition: Json): Json =>
    Array.isArray(edition.copies) ? { ...edition, copies: edition.copies.map(withChangesOf) } : edition

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

/** The value a node states under a key, less the doubted references, which go to the quoted. */
const unquoted = (subject: string, key: string, value: Json, quoted: Json[]): Json => {
    if (Array.isArray(value)) {
        return value.filter(item => {
            if (!isDoubtedReference(item)) return true
            quoted.push(quote(subject, key, item, true))
            return false
        })
    }
    if (!isDoubtedReference(value)) return value
    quoted.push(quote(subject, key, value, false))
    return undefined
}

/**
 * The document with every doubted reference taken off the node that
 * states it, and quoted instead, in the order the document states them.
 *
 * An `@annotation` in JSON-LD-star states the triple it annotates and
 * then says something about it, so a statement the edition holds
 * possible, unlikely or false would reach RDF as a fact. Only references
 * between nodes are quoted, since only they can be put back where they
 * stood; a doubted date or attribution stays annotated in place.
 */
const withDoubtedReferencesQuoted = (value: Json, quoted: Json[]): Json => {
    if (Array.isArray(value)) return value.map(item => withDoubtedReferencesQuoted(item, quoted))
    if (!isRecord(value)) return value

    const subject = value['@id']
    const node: Record<string, Json> = {}
    Object.entries(value).forEach(([key, child]) => {
        const stated = typeof subject === 'string' && !key.startsWith('@') ? unquoted(subject, key, child, quoted) : child
        const below = withDoubtedReferencesQuoted(stated, quoted)
        if (below !== undefined) node[key] = below
    })
    return node
}

/** The edition with each copy's features and tears at the copy's own places, as a document holds them. */
const atOwnPlacesAll = (edition: Edition): Edition =>
    edition.copies.some(copy => copy.measurements.alignment)
        ? { ...edition, copies: edition.copies.map(atOwnPlaces) }
        : edition

/**
 * Writes the edition as a JSON-LD document in the terms of the Roll
 * Edition Ontology. Each copy's features and tears go back to the
 * copy's own places, as they were read, with the alignment beside them,
 * and every version carries the context of its own reproducing system.
 * A reference the edition holds possible, unlikely or false is quoted
 * rather than stated, so that a reader of the RDF does not take it for
 * a fact. The edition given is not changed.
 * @category Reading and writing
 */
export const asJsonLd = (edition: Edition) => {
    const quoted: Json[] = []
    const node = withDoubtedReferencesQuoted(withSystemContexts(withCreations(withChanges(asJsonLdEntity(atOwnPlacesAll(edition))))), quoted)
    // The context is the export's own; one carried in from an import must not override it.
    const { base, '@context': carried, ...rest } = node

    return {
        '@context': [
            'https://w3id.org/reo/context.jsonld',
            {
                '@base': edition.base
            }
        ],
        '@id': edition.base,
        ...rest,
        ...(quoted.length > 0 && { '@included': quoted })
    }
}
