import { v4 } from "uuid";
import { Edition } from "./Edition";
import { RollCopy } from "./RollCopy";
import { AnyRollEvent, CollatedEvent } from "./types";

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
    const result: any = json;

    for (const [key, value] of Object.entries(json)) {
        if (key === '@type') {
            result['type'] = value;
        } else if (key === '@id') {
            result['id'] = value;
        } else if (['contains', 'wasCollatedFrom', 'replaced', 'target', 'annotated'].includes(key)) {
            if (Array.isArray(value)) {
                result[key] = fromIDArray(value, entitiesWithId);
            }
        } else if (key === 'hand' && typeof value === 'string') {
            result[key] = entitiesWithId.get(value);
        } else if (Array.isArray(value)) {
            result[key] = value.map(v => fromJsonLdEntity(v, entitiesWithId));
        } else if (typeof value === 'object') {
            result[key] = fromJsonLdEntity(value, entitiesWithId);
        }
        //  else {
        //     result[key] = value;
        // }
    }

    return result;
}

export const importJsonLd = (json: any): Edition => {
    const entitiesWithId = collectEntitiesWithId(json)

    const edition: Edition = new Edition()
    edition.title = json.title || 'untitled'
    edition.license = json.license || 'no license'
    edition.publicationEvent = fromJsonLdEntity(json.publicationEvent, entitiesWithId)
    edition.roll = fromJsonLdEntity(json.roll, entitiesWithId)

    edition.copies = (json.copies || []).map((copy: any) => {
        const newCopy = new RollCopy()
        
        newCopy.id = copy['@id'] || v4()

        newCopy.productionEvent = fromJsonLdEntity(copy.productionEvent, entitiesWithId)
        newCopy.scan = copy.scan

        newCopy.conditions = (copy.conditions || []).map((c: any) => fromJsonLdEntity(c, entitiesWithId))
        newCopy.hands = (copy.hands || []).map((c: any) => fromJsonLdEntity(c, entitiesWithId))
        if (copy.stretch) newCopy.stretch = fromJsonLdEntity(copy.stretch, entitiesWithId)
        if (copy.shift) newCopy.shift = fromJsonLdEntity(copy.shift, entitiesWithId)

        const events = copy.measurement.events
        if (Array.isArray(events)) {
            delete copy.measurement.events
            newCopy.measurement = copy.measurement ? fromJsonLdEntity(copy.measurement, entitiesWithId) : undefined
            newCopy.insertEvents(events.map((event: any) => fromJsonLdEntity(event, entitiesWithId)))
        }

        const additions = (copy.additions || []).map((a: any) => fromJsonLdEntity(a, entitiesWithId))
        const conjectures = (copy.conjectures || []).map((c: any) => fromJsonLdEntity(c, entitiesWithId))

        newCopy.applyActions([...additions, ...conjectures])

        return newCopy
    })

    edition.editGroups = (json.groups || []).map((r: any) => fromJsonLdEntity(r, entitiesWithId))

    edition.collationResult = {
        events: json.events.map((event: any) => {
            const result: CollatedEvent = fromJsonLdEntity(event, entitiesWithId)

            if (Array.isArray(event.wasCollatedFrom)) {
                result.wasCollatedFrom = event.wasCollatedFrom
                    .map((rollEventId: any) => {
                        const containingRoll = edition.copies.find(copy => copy.hasEventId(rollEventId.id))
                        if (!containingRoll) return undefined

                        return containingRoll.events.find(e => e.id === rollEventId.id)
                    })
                    .filter((e: AnyRollEvent | undefined) => e !== undefined)
            }

            return result
        })
    }

    return edition;
}
