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

const fromJsonLdEntity = (json: any): any => {
    if (typeof json !== 'object') {
        return json
    }

    let result: any = json;

    if ('@value' in json) {
        // the datatype of a value object, not a class
        delete result['@type'];
    }
    else if ('@type' in json) {
        result['type'] = json['@type'];
        delete result['@type'];
    }

    for (const [key, value] of Object.entries(json)) {
        if (key === '@id') {
            // console.log("deleting @id", value);
            result['id'] = value;
            delete result['@id'];
        }
        else if (typeof value === 'string' && isDate(value)) {
            result[key] = importDate(value);
        }
        else if (Array.isArray(value)) {
            result[key] = value.map(v => {
                if (typeof v === 'string') {
                    if (isDate(v)) {
                        return importDate(v);
                    }
                    return v;
                }
                else {
                    return fromJsonLdEntity(v)
                }
            })
        }
        else if (typeof value === 'object') {
            result[key] = fromJsonLdEntity(value);
        }
        else {
            result[key] = value;
        }
    }

    return result;
}

// The export prefixes copy identifiers with `copy/`; this is its inverse.
const withPlainCopyIds = (json: any) => ({
    ...json,
    copies: (json.copies ?? []).map((copy: any) => ({
        ...copy,
        '@id': typeof copy['@id'] === 'string' ? copy['@id'].replace(/^copy\//, '') : copy['@id']
    }))
})

export const importJsonLd = (json: any): Edition => {
    const { '@context': context, ...document } = withPlainCopyIds(migrate(json))
    const edition = fromJsonLdEntity(document) as Edition;
    edition.base = Array.isArray(context)
        ? context.find((c: any) => c['@base'])?.['@base'] || ''
        : '';

    return edition;
}
