import { RollCopy } from "./RollCopy";
import { v4 } from "uuid";
import { AnyRollEvent } from "./RollEvent";
import { WithId } from "./WithId";

export interface Symbol extends WithId {
    isCarriedBy: AnyRollEvent[]
}

export const isCollatedEvent = (e: any): e is Symbol => {
    return 'wasCollatedFrom' in e
}

const inRange = (range: [number, number], search: number) => {
    return search > range[0] && search < range[1]
}

const determinePitch = (event: AnyRollEvent) => {
    if (event.type === 'note') {
        return event.pitch
    }

    return event.vertical.from
}

const reduceEvents = async (collatedEvents: Symbol[], otherEvents: AnyRollEvent[], tolerance = 5) => {
    type EventInfo = {
        onset: number
        offset: number
        pitch: number
        id: string
    }

    const myInfo: EventInfo[] = []
    for (const event of collatedEvents) {
        if (!collatedEvents.length) continue

        const pitch = determinePitch(event.isCarriedBy[0])

        myInfo.push({
            id: event.id,
            onset: event.isCarriedBy.reduce((acc, current) => acc + current.horizontal.from, 0) / event.isCarriedBy.length,
            offset: event.isCarriedBy.reduce((acc, current) => acc + current.horizontal.to, 0) / event.isCarriedBy.length,
            pitch
        })
    }

    myInfo.sort((a, b) => a.onset - b.onset)

    const otherInfo: EventInfo[] = otherEvents.map(e => {
        const pitch = determinePitch(e)

        return {
            id: e.id,
            onset: e.horizontal.from,
            offset: e.horizontal.to,
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
                isCarriedBy: [correspEvent]
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


        collatedEvents.find(e => e.id === bestEvent.id)?.isCarriedBy?.push(me)
    }
}


/**
 * Collates multiple roll copies. 
 */
export const collateRolls = (rolls: RollCopy[], tolerance = 5): Collation => {
    const collatedEvents: Symbol[] = rolls[0].getConstitutedEvents().map(event => ({
        id: v4(),
        isCarriedBy: [event]
    }))

    for (let i = 1; i < rolls.length; i++) {
        reduceEvents(collatedEvents, rolls[i].getConstitutedEvents())
    }

    return {
        measured: rolls,
        tolerance,
        events: collatedEvents
    }
}

export const sourceOf = (sources: RollCopy[], eventId: string) => {
    const containingSource = sources.find(source => source.hasEventId(eventId))
    if (!containingSource) return
    return containingSource.id
}

export const sourcesOf = (sources: RollCopy[], event_: Symbol | Symbol[] | string[]) => {
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
        for (const copyEvent of event.isCarriedBy) {
            const sourceLink = sourceOf(sources, copyEvent.id)
            if (!sourceLink) continue

            result.add(sourceLink)
        }
    }

    return result
}

/**
 * D10 Software Execution (not D11 Digital Measurement Event, 
 * since it's independent from environmental factors).
 */
export interface Collation {
    measured: RollCopy[] // L2 used as source
    tolerance: number // L13 used parameters
    events: Symbol[] // L20 created
}

/**
 * Computes a pairwise distance matrix from raw data with missing values,
 * using Euclidean distance and a fixed penalty for missing vs. present.
 */
function computeDistanceMatrix(
    data: Array<Array<number | null>>,
    penalty: number
): number[][] {
    const nTaxa = data.length;
    if (nTaxa === 0) {
        return [];
    }
    const nChars = data[0].length;

    // Initialize an N×N matrix filled with zeros
    const distMatrix: number[][] = Array.from({ length: nTaxa }, () =>
        Array(nTaxa).fill(0)
    );

    // Helper to compute distance between two rows (i, j)
    function distanceBetween(
        rowA: Array<number | null>,
        rowB: Array<number | null>
    ): number {
        let sumSq = 0;
        for (let k = 0; k < nChars; k++) {
            const a = rowA[k];
            const b = rowB[k];
            if (a === null && b === null) {
                // both missing: contribute 0
                continue;
            } else if (a === null || b === null) {
                // one missing, one present: add penalty^2
                sumSq += penalty * penalty;
            } else {
                // both present: add squared difference
                const diff = a - b;
                sumSq += diff * diff;
            }
        }
        return Math.sqrt(sumSq);
    }

    for (let i = 0; i < nTaxa; i++) {
        for (let j = i + 1; j < nTaxa; j++) {
            const d = distanceBetween(data[i], data[j]);
            distMatrix[i][j] = d;
            distMatrix[j][i] = d;
        }
    }

    return distMatrix;
}

export const generateNexusDistanceMatrix = (collation: Collation) => {
    // prepare the data
    const data: Array<Array<number | null>> = []
    const numberOfWitnesses = collation.measured.length

    const numEvents = collation.events.length
    // Build data so rows = witnesses, columns = events
    for (let witnessIndex = 0; witnessIndex < numberOfWitnesses; witnessIndex++) {
        const row: Array<number | null> = new Array(numEvents).fill(null)
        collation.events.forEach((event, eventIndex) => {
            const avgFrom =
                event.isCarriedBy.reduce((acc, e) => acc + e.horizontal.from, 0) /
                event.isCarriedBy.length
            const avgTo =
                event.isCarriedBy.reduce((acc, e) => acc + e.horizontal.to, 0) /
                event.isCarriedBy.length

            for (const rollEvent of event.isCarriedBy) {
                const sourceIdx = collation.measured.findIndex(copy =>
                    copy.hasEvent(rollEvent)
                )
                if (sourceIdx === witnessIndex) {
                    const onDiff = Math.abs(rollEvent.horizontal.from - avgFrom)
                    const offDiff = Math.abs(rollEvent.horizontal.to - avgTo)
                    row[eventIndex] = onDiff + offDiff
                    break
                }
            }
        })
        data.push(row)
    }

    const distanceMatrix = computeDistanceMatrix(data, 20)

    const nTaxa = numberOfWitnesses
    const labels = collation.measured.map(c => c.siglum)

    const matrixLines = distanceMatrix.map((row, i) => {
        const label = labels[i]
        const entries = row.map(d => d.toFixed(4)).join('  ')
        return `    ${label}  ${entries}`
    }).join('\n')

    return `
#nexus

Begin DISTANCES;
    Dimensions NTax=${nTaxa};
    Format labels diagonal;
    Matrix
${matrixLines}
    ;
End;

Begin PAUP;
    set criterion=distance;
    nj;
End;
    `
}

export const generateNexusMatrix = (collation: Collation) => {
    // prepare the data
    const data: Array<Array<number | null>> = []
    const numberOfWitnesses = collation.measured.length

    const numEvents = collation.events.length
    // Build data so rows = witnesses, columns = events
    for (let witnessIndex = 0; witnessIndex < numberOfWitnesses; witnessIndex++) {
        const row: Array<number | null> = new Array(numEvents).fill(null)
        collation.events.forEach((event, eventIndex) => {
            for (const rollEvent of event.isCarriedBy) {
                const sourceIdx = collation.measured.findIndex(copy =>
                    copy.hasEvent(rollEvent)
                )
                if (sourceIdx === witnessIndex) {
                    row[eventIndex] = 0
                    break
                }
            }
        })
        data.push(row)
    }

    return `
#nexus 

Begin DATA;
    Dimensions NTax=${numberOfWitnesses} NChar=${numEvents};
    Format datatype=standard missing=? gap=-;
    Matrix
${collation.measured.map(c => c.siglum).join(' ')}
${data.map((row, i) => `${collation.measured[i].siglum} ${row.map(v => v === null ? '?' : v).join(' ')}`).join('\n')}
    ;
End;
`
}
