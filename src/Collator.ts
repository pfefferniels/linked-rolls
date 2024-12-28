import { RollCopy } from "./RollCopy";
import { v4 } from "uuid";
import { typeToKey } from "./keyToType";
import { AnyRollEvent, CollatedEvent } from "./types";
import { AnyEditorialAction } from "./EditorialActions";

const inRange = (range: [number, number], search: number) => {
    return search > range[0] && search < range[1]
}

const determinePitch = (firstEvent: AnyRollEvent) => {
    if (firstEvent.type === 'note') {
        return firstEvent.hasPitch
    }
    else if (firstEvent.type === 'expression') {
        return typeToKey(firstEvent.P2HasType, firstEvent.hasScope) || 0
    }

    return firstEvent.hasDimension.vertical.from
}

const reduceEvents = async (collatedEvents: CollatedEvent[], otherEvents: AnyRollEvent[], tolerance = 5) => {
    type EventInfo = {
        onset: number
        offset: number
        pitch: number
        id: string
    }

    const myInfo: EventInfo[] = []
    for (const event of collatedEvents) {
        if (!collatedEvents.length) continue

        const pitch = determinePitch(event.wasCollatedFrom[0])

        myInfo.push({
            id: event.id,
            onset: event.wasCollatedFrom.reduce((acc, current) => acc + current.hasDimension.horizontal.from, 0) / event.wasCollatedFrom.length,
            offset: event.wasCollatedFrom.reduce((acc, current) => acc + current.hasDimension.horizontal.to!, 0) / event.wasCollatedFrom.length,
            pitch
        })
    }

    myInfo.sort((a, b) => a.onset - b.onset)

    const otherInfo: EventInfo[] = otherEvents.map(e => {
        const pitch = determinePitch(e)

        return {
            id: e.id,
            onset: e.hasDimension.horizontal.from,
            offset: e.hasDimension.horizontal.to!,
            pitch
        }
    })

    // console.log(myInfo.map(info => info.onset))
    // console.log(otherInfo.map(info => info.onset))

    for (const info of otherInfo) {
        // console.log('searching candidates for', info)
        // same pitch and approximately the same region?
        const candidates = myInfo.filter(i => {
            return (
                i.pitch === info.pitch &&
                inRange([i.onset - tolerance, i.onset + tolerance], info.onset) &&
                inRange([i.offset - tolerance, i.offset + tolerance], info.offset))
        })

        if (!candidates.length) {
            console.log('no candidates found for', info.onset, ':', myInfo.filter(i => i.pitch === info.pitch), 'does not fit.')
            const correspEvent = otherEvents.find(e => e.id === info.id)
            if (!correspEvent) {
                // this is not supposed to happen
                throw new Error('No corresponding event found for info ID')
            }

            collatedEvents.push({
                id: v4(),
                wasCollatedFrom: [correspEvent]
            })
            continue
        }

        const diffs = candidates.map(i =>
            Math.abs(i.onset - info.onset) + Math.abs(i.onset - info.offset))
        const bestIndex = diffs.indexOf(Math.min(...diffs))
        const bestEvent = candidates[bestIndex]

        const me = otherEvents.find(e => e.id === info.id)

        if (!me) {
            // this is not supposed to happen
            throw new Error('No corresponding event found for info ID')
        }


        collatedEvents.find(e => e.id === bestEvent.id)?.wasCollatedFrom?.push(me)
    }
}


/**
 * Collates multiple roll copies. 
 */
export const collateRolls = (rolls: RollCopy[]): CollationResult => {
    const collatedEvents: CollatedEvent[] = rolls[0].events.map(event => ({
        id: v4(),
        wasCollatedFrom: [event]
    }))

    for (let i = 1; i < rolls.length; i++) {
        reduceEvents(collatedEvents, rolls[i].events)
    }

    return {
        events: collatedEvents
    }
}

/**
 * Insert readings
 */
export const insertReadings = (sources: RollCopy[], events: CollatedEvent[], assumptions: AnyEditorialAction[]) => {
    for (const event of events) {
        const allSources = sources.map(s => s.id).sort()
        const eventSources = Array.from(sourcesOf(sources, event)).sort()

        if (!allSources.every((source, index) => source === eventSources[index])) {
            // Not all sources contain the event. Create 
            // a reading.
            assumptions.push({
                type: 'editGroup',
                contains: [event],
                carriedOutBy: '#collation-tool',
                id: v4()
            })
        }
    }
}

export const sourceOf = (sources: RollCopy[], eventId: string) => {
    const containingSource = sources.find(source => source.hasEventId(eventId))
    if (!containingSource) return
    return containingSource.id
}

export const sourcesOf = (sources: RollCopy[], event_: CollatedEvent | CollatedEvent[] | string[]) => {
    const result: Set<string> = new Set()

    if (Array.isArray(event_) && event_.every(e => typeof e === 'string')) {
        for (const id of event_) {
            const sourceLink = sourceOf(sources, id)
            if (!sourceLink) continue

            result.add(sourceLink)
        }
        return result
    }

    const events = Array.isArray(event_) ? event_ : [event_]

    for (const event of events) {
        for (const copyEvent of event.wasCollatedFrom) {
            const sourceLink = sourceOf(sources, copyEvent.id)
            if (!sourceLink) continue

            result.add(sourceLink)
        }
    }

    return result
}

export interface CollationResult {
    events: CollatedEvent[]
}
