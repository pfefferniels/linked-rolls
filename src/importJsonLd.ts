import { Edition } from "./Edition";
import { RollCopy } from "./RollCopy";
import { referenceTypes } from "./asJsonLd";

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

type IdMap = Map<string, object>

const collectEntitiesWithId = (json: any): IdMap => {
    const result: IdMap = new Map()

    // Check if the current object has an `id` property and store it
    if (json && typeof json === 'object') {
        if ('@id' in json) {
            result.set(json['@id'], json)
        }
    }

    // Recursively search within arrays or nested objects
    for (const key in json) {
        if (Array.isArray(json[key])) {
            for (const item of json[key]) {
                collectEntitiesWithId(item).forEach((v, k) => result.set(k, v))
            }
        } else if (typeof json[key] === 'object' && json[key] !== null) {
            collectEntitiesWithId(json[key]).forEach((v, k) => result.set(k, v));
        }
    }

    return result;
};

const fromIDArray = (arr: string[], entities: IdMap): any[] => {
    return arr.map(id => {
        const entity = entities.get(id)
        if (!entity) {
            console.warn('Could not find entity with id', id)
        }
        return entity;
    });
}

const fromJsonLdEntity = (json: any, entitiesWithId: IdMap): any => {
    console.log('importing', json)
    if (typeof json !== 'object') {
        return json
    }

    let result: any = json;

    if ('@type' in json) {
        const value = json['@type'];
        if (value === 'RollCopy') {
            result = new RollCopy();
        }
        else {
            result['type'] = value;
        }
    }

    for (const [key, value] of Object.entries(json)) {
        if (key === '@id') {
            result['id'] = value;
        }
        if (typeof value === 'string' && isDate(value)) {
            result[key] = importDate(value);
        }
        else if ([...referenceTypes, 'premises', 'delete', 'comprehends', 'assigned'].includes(key)) {
            if (Array.isArray(value) && value.every(e => typeof e === 'string')) {
                result[key] = fromIDArray(value, entitiesWithId)
            }
            else if (typeof value === 'string') {
                if (isDate(value)) {
                    result[key] = importDate(value);
                } else {
                    const entity = entitiesWithId.get(value);
                    if (entity) {
                        result[key] = entity
                    } else {
                        console.warn('Could not find entity with id', value);
                    }
                }
            }
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
                    return fromJsonLdEntity(v, entitiesWithId)
                }
            })
        }
        else if (typeof value === 'object') {
            result[key] = fromJsonLdEntity(value, entitiesWithId);
        }
        else {
            result[key] = value;
        }
    }

    return result;
}

export const importJsonLd = (json: any): Edition => {
    const entitiesWithId = collectEntitiesWithId(json)
    const edition = fromJsonLdEntity(json, entitiesWithId) as Edition;
    if (Array.isArray(json['@context'])) {
        edition.base = json['@context'].find((c: any) => c['@base'])?.['@base'] || '';
    }

    return edition;
}
