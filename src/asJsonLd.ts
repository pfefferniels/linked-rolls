import { Edition } from "./Edition";
import { WithId } from "./types";

const asIDArray = (arr: WithId[]) => {
    return arr.map(e => e.id)
}

const asJsonLdEntity = (obj: object) => {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
        if (['contains', 'wasCollatedFrom', 'replaced', 'with', 'assignedTo', 'annotated'].includes(key)) {
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
        '@context': 'https://aepg.org/rollo/1.0/edition.jsonld',
        '@type': "Edition",

        title: edition.title,
        license: edition.license,
        publicationEvent: asJsonLdEntity(edition.publicationEvent),
        roll: asJsonLdEntity(edition.roll),

        copies: edition.copies.map(copy => ({
            '@type': 'RollCopy',
            productionEvent: asJsonLdEntity(copy.productionEvent),
            scan: copy.scan,
            conditions: copy.conditions.map(asJsonLdEntity),
            measurement: copy.measurement ? asJsonLdEntity(copy.measurement) : undefined,
            hands: copy.hands.map(asJsonLdEntity),
            additions: copy.additions.map(asJsonLdEntity),
            conjectures: copy.conjectures.map(asJsonLdEntity),
        })).flat(),
        events: edition.collationResult.events.map(e => ({
            type: 'collatedEvent',
            ...e
        })).map(asJsonLdEntity),
        groups: edition.relations.map(asJsonLdEntity),
        // annotations: edition.annotations.map(asJsonLdEntity),
    }

    return result
}
