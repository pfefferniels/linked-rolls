import { Edition } from "./Edition";

export const exportDate = (date: Date) => {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

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

    if ('@type' in json) {
        result['type'] = json['@type'];
    }

    for (const [key, value] of Object.entries(json)) {
        if (key === '@id') {
            result['id'] = value;
        }
        if (typeof value === 'string' && isDate(value)) {
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

export const importJsonLd = (json: any): Edition => {
    const edition = fromJsonLdEntity(json) as Edition;
    if (Array.isArray(json['@context'])) {
        edition.base = json['@context'].find((c: any) => c['@base'])?.['@base'] || '';
    }

    return edition;
}
