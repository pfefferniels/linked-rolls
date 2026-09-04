import { Edition } from "./Edition";
import { systemIdOf } from "./TrackerBar";

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
 * The context of the roll's reproducing system, which reads the
 * expression types as that system's terms.
 */
const systemContextOf = (edition: Edition): string[] => {
    const system = systemIdOf(edition.roll?.system)
    return system ? [`https://w3id.org/reo/${system}/context.jsonld`] : []
}

export const asJsonLd = (edition: Edition) => {
    // The context is the export's own; one carried in from an import must not override it.
    const { base, copies, '@context': carried, ...rest } = asJsonLdEntity(edition)

    return {
        '@context': [
            'https://w3id.org/reo/context.jsonld',
            ...systemContextOf(edition),
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
