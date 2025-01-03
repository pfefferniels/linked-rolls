import { Edition } from "./Edition";
import { WithId } from "./WithId";

const asIDArray = (arr: WithId[]) => {
    return arr.map(e => e.id)
}

const asJsonLdEntity = (obj: object) => {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'function' || typeof value === 'undefined') {
            // ignore
        }
        else if (['contains', 'wasCollatedFrom', 'replaced', 'target', 'annotated', 'witnesses', 'measurement', 'measured'].includes(key)) {
            result[key] = asIDArray(value)
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
            result[key] = value.map(v => asJsonLdEntity(v))
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
        '@context': 'https://linked-rolls.org/rollo/1.0/edition.jsonld',
        '@type': "Edition",
        ...asJsonLdEntity(edition)
    }

    return result
}
