import { Edition } from "./Edition";
import { RollCopy } from "./RollCopy";

export const importJsonLd = (json: any): Edition => {
    const result: Edition = new Edition()

    if (Array.isArray(json.events)) {
        result.collationResult.events = json.events
    }

    if (Array.isArray(json.relations)) {
        result.relations = json.relations
    }

    if (Array.isArray(json.annotations)) {
        result.annotations = json.annotations
    }

    if (Array.isArray(json.copies)) {
        result.copies = json.copies.map((copy: any) => {
            const newCopy = new RollCopy()
            if (copy.measurement) {
                const m = copy.measurement
                if (!m.hasCreated || !m.hasCreated.events) return undefined

                const correspEvents = result.collationResult.events
                    .map(ce => ce.wasCollatedFrom.find(e => m.hasCreated.events.includes(e.id)))
                    .filter(rollEvent => rollEvent !== undefined)

                m.hasCreated.events = correspEvents

                newCopy.measurement = m
                newCopy.events.push(...correspEvents)
            }
        })
    }

    return result
}

