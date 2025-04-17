import { v4 } from "uuid";
import { Edition } from "./Edition";
import { RollCopy } from "./RollCopy";
import { StageCreation } from "./Stage";
import { AnyRollEvent } from "./RollEvent";

type IdMap = Map<string, object>

const collectEntitiesWithId = (json: any): IdMap => {
    const result: IdMap = new Map()

    // Check if the current object has an `id` property and store it
    if (json && typeof json === 'object' && '@id' in json) {
        result.set(json['@id'], json)
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
    return arr.map(id => entities.get(id) || { id: '[unknown]' });
}

const fromJsonLdEntity = (json: any, entitiesWithId: IdMap): any => {
    let result: any = json;

    for (const [key, value] of Object.entries(json)) {
        if (key === '@type') {
            if (value === 'Edition') {
                result = new Edition();
            }
            else if (value === 'RollCopy') {
                result = new RollCopy();
            }
            else if (value === 'StageCreation') {
                result = new StageCreation({ siglum: '', witnesses: [] }, {
                    type: 'objectUsage',
                    argumentation: {
                        actor: '#collation-tool',
                        premises: [],
                        adoptedBeliefs: [],
                        observations: [],
                    },
                    certainty: 'true',
                    id: v4(),
                    original: { id: '[unknown]' },
                });
            }
            else {
                result['type'] = value;
            }
        } else if (key === '@id') {
            result['id'] = value;
        } else if (['contains', 'wasCollatedFrom', 'replaced', 'target', 'annotated', 'witnesses'].includes(key)) {
            if (Array.isArray(value)) {
                result[key] = fromIDArray(value, entitiesWithId);
            }
        } else if (key === 'hand' && typeof value === 'string') {
            result[key] = entitiesWithId.get(value);
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

    edition.copies.forEach((copy: RollCopy) => {
        copy.applyActions(copy.actions);
    });

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
    })

    return edition;
}
