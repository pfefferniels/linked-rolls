import { Edition } from "./Edition";
import { WithId } from "./WithId";

// for these keys, references by id will be inserted
// rather than the object itself.
export const referenceTypes = [
    'premises',
    'insert',
    'delete',
    'wasCollatedFrom',
    'replaced',
    'target',
    'annotated',
    'witnesses',
    'measured'
]

const asIDArray = (arr: WithId[]) => {
    return arr.map(e => e.id)
}

const asJsonLdEntity = (obj: object) => {
    const result: any = {}

    if ('asJSON' in obj && typeof obj['asJSON'] === 'function') {
        return asJsonLdEntity(obj['asJSON']())
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'function' || typeof value === 'undefined') {
            // ignore
        }
        if (['original', 'measurement'].includes(key)) {
            if ('siglum' in value) {
                result[key] = value.siglum;
            }
            else {
                result[key] = value.id;
            }
        }
        else if (referenceTypes.includes(key)) {
            if (!Array.isArray(value)) {
                console.error(`Expected array for key ${key}, got ${value}`)
            }
            else {
                result[key] = asIDArray(value)
            }
        }
        else if (['hand'].includes(key)) {
            result[key] = value.id || '[unknown]'
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

export const asJsonLd = (edition: Edition) => {
    const result: any = {
        '@context': [
            'https://linked-rolls.org/rollo/1.0/edition.jsonld',
            {
                '@base': edition.base
            }
        ],
        '@type': "Edition",
        ...asJsonLdEntity(edition)
    }

    return result
}
