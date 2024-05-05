import { RollCopy } from "./RollCopy";
import { v4 } from "uuid";
import { typeToKey } from "./keyToType";
import { CollatedEvent, Expression, Note, Shifting, Stretching } from "./types";

export type Operation = Shifting | Stretching

const inRange = (range: [number, number], search: number) => {
    return search > range[0] && search < range[1]
}

const reduceEvents = async (collatedEvents: CollatedEvent[], otherEvents: (Note | Expression)[], tolerance = 5) => {
    type EventInfo = {
        onset: number
        offset: number
        pitch: number
        id: string
    }

    const myInfo: EventInfo[] = []
    for (const event of collatedEvents) {
        if (!collatedEvents.length) continue

        const firstEvent = event.wasCollatedFrom[0]

        const pitch = firstEvent.type === 'note'
            ? firstEvent.hasPitch
            : typeToKey((firstEvent as Expression).P2HasType) || 0

        myInfo.push({
            id: event.id,
            onset: event.wasCollatedFrom.reduce((acc, current) => acc + current.hasDimension.from, 0) / event.wasCollatedFrom.length,
            offset: event.wasCollatedFrom.reduce((acc, current) => acc + current.hasDimension.to, 0) / event.wasCollatedFrom.length,
            pitch
        })
    }

    myInfo.sort((a, b) => a.onset - b.onset)

    const otherInfo: EventInfo[] = otherEvents.map(e => {
        const pitch = e.type === 'note'
            ? (e as Note).hasPitch
            : typeToKey((e as Expression).P2HasType) || 0
        return {
            id: e.id,
            onset: e.hasDimension.from,
            offset: e.hasDimension.to,
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
                console.log('This is not supposed to happen')
                continue
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
            console.log('This is not supposed to happen')
            continue
        }

        collatedEvents.find(e => e.id === bestEvent.id)?.wasCollatedFrom?.push(me)
    }
}


export const collateRolls = (rolls: RollCopy[]) => {
    const collatedEvents: CollatedEvent[] = rolls[0].events.map(event => ({
        id: event.id, 
        wasCollatedFrom: [event]
    }))

    for (let i = 1; i < rolls.length; i++) {
        reduceEvents(collatedEvents, rolls[i].events)
    }

    return collatedEvents
}
