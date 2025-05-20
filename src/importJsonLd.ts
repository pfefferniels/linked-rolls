import { v4 } from "uuid";
import { Edition } from "./Edition";
import { RollCopy } from "./RollCopy";
import { StageCreation } from "./Stage";
import { AnyRollEvent } from "./RollEvent";
import { referenceTypes } from "./asJsonLd";

type IdMap = Map<string, object>

const collectEntitiesWithId = (json: any): IdMap => {
    const result: IdMap = new Map()

    // Check if the current object has an `id` property and store it
    if (json && typeof json === 'object') {
        if ('@id' in json) {
            result.set(json['@id'], json)
        }
        if ('siglum' in json) {
            result.set(json['siglum'], json)
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
    if (typeof json !== 'object') {
        return json
    }

    let result: any = json;

    if ('@type' in json) {
        const value = json['@type'];
        if (value === 'Edition') {
            result = new Edition();
        }
        else if (value === 'RollCopy') {
            result = new RollCopy();
        }
        else if (value === 'StageCreation') {
            result = new StageCreation({ siglum: '', witnesses: [] }, {
                type: 'objectUsage',
                certainty: 'true',
                id: v4(),
                original: { id: '[unknown]' },
            });
        }
        else {
            result['type'] = value;
        }
    }

    for (const [key, value] of Object.entries(json)) {
        if (key === '@id') {
            result['id'] = value;
        } else if ([...referenceTypes, 'measurement', 'original'].includes(key)) {
            if (Array.isArray(value) && value.every(e => typeof e === 'string')) {
                result[key] = fromIDArray(value, entitiesWithId)
            }
            else if (typeof value === 'string') {
                const entity = entitiesWithId.get(value);
                if (entity) {
                    result[key] = entity, entitiesWithId;
                } else {
                    console.warn('Could not find entity with id', value);
                }
            }
        } else if (key === 'hand' && typeof value === 'string') {
            result[key] = entitiesWithId.get(value)
        } else if (Array.isArray(value)) {
            result[key] = value.map(v => {
                if (typeof v === 'string') {
                    return v;
                }
                else {
                    return fromJsonLdEntity(v, entitiesWithId)
                }
            })
        } else if (typeof value === 'object') {
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

    edition.copies.forEach(copy => copy.constituteEvents())

    edition.collation.events.forEach(e => {
        e.wasCollatedFrom = e.wasCollatedFrom
            .map(re => {
                const containingRoll = edition.copies.find(copy => copy.hasEventId(re.id))
                return containingRoll?.getConstitutedEvents().find(e => e.id === re.id)
            })
            .filter((e: AnyRollEvent | undefined) => e !== undefined)
    })

    edition.stages.forEach((stage: StageCreation) => {
        stage.created.witnesses = stage.created.witnesses.map(witness => {
            const copy = edition.copies.find(copy => copy.siglum === witness.siglum)
            return copy || witness;
        })

        const original = stage.basedOn.original
        if ('siglum' in original) {
            const ref = edition.stages.find(creation => creation.created.siglum === original.siglum)
            if (ref) {
                stage.basedOn.original = ref.created
            }
        }
    })

    edition.collation.measured = edition.collation.measured.map((measured: RollCopy) => {
        const copy = edition.copies.find(c => c.siglum === measured.siglum)
        return copy || measured;
    })

    return edition;
}
