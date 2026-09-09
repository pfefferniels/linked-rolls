import { Edition } from "./Edition";
import { migrate } from "./migrate";

const isDate = (value: string) => {
    const datePattern = /^\d{4}-\d{1,2}-\d{1,2}$/;
    return datePattern.test(value);
}

export const importDate = (str: string): Date => {
    const [y, m, d] = str.split('-').map(s => parseInt(s, 10))
    if ([y, m, d].some(n => isNaN(n))) {
        throw new Error(`Invalid date format: "${str}". Expected "YYYY-MM-DD".`)
    }
    return new Date(y, m - 1, d)
}

type Json = any

/** A value as the edition holds it: a date read, an entity converted, anything else as it stands. */
const fromJsonLdValue = (value: Json): Json => {
    if (typeof value === 'string') return isDate(value) ? importDate(value) : value
    if (Array.isArray(value)) return value.map(fromJsonLdValue)
    if (value !== null && typeof value === 'object') return fromJsonLdEntity(value)
    return value
}

/**
 * An entity with its keywords read as plain keys. The input is left as
 * it is. The `@type` of a value object names the datatype of the value,
 * not a class, and is dropped. So is a context: a version carries one
 * naming its system's vocabulary, and it belongs to the serialisation
 * rather than to the edition, which states the system as data.
 */
const fromJsonLdEntity = (json: Record<string, Json>): Record<string, Json> => {
    const { '@type': type, '@id': id, '@context': context, ...rest } = json
    const entity = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, fromJsonLdValue(value)]))
    if (type !== undefined && !('@value' in json)) entity.type = type
    if (id !== undefined) entity.id = id
    return entity
}

// The export prefixes copy identifiers with `copy/`; this is its inverse.
const withPlainCopyIds = (json: Json) => ({
    ...json,
    copies: (json.copies ?? []).map((copy: Json) => ({
        ...copy,
        '@id': typeof copy['@id'] === 'string' ? copy['@id'].replace(/^copy\//, '') : copy['@id']
    }))
})

export const importJsonLd = (json: Json): Edition => {
    const { '@context': context, ...document } = withPlainCopyIds(migrate(json))
    const edition = fromJsonLdEntity(document) as Edition;
    edition.base = Array.isArray(context)
        ? context.find((c: Json) => c['@base'])?.['@base'] || ''
        : '';

    return edition;
}
