import { Edition } from "./Edition";
import { systemIdIn } from "./TrackerBar";

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

export const asJsonLd = (edition: Edition) => {
    // The context is the export's own; one carried in from an import must not override it.
    const { base, copies, '@context': carried, ...rest } = withSystemContexts(asJsonLdEntity(edition))

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
        copies: (copies as any[])?.map(copy => ({
            ...copy,
            '@id': `copy/${copy['@id']}`
        }))
    }
}
