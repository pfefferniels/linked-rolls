/** Which reproducing system a version of the stemma is coded for, and which systems a roll was re-cut into. */
import { procedures } from "../model/procedures.js"
import { trackerBars } from "../systems/index.js"
import { TrackerBar } from "../systems/TrackerBar.js"

const TRANSFER = /\/umstanzung\/(.+)-to-(.+)$/

/**
 * By system, the systems a roll of it was re-cut for, as the procedures
 * of the vocabulary name them: a red roll was re-punched for the
 * Licensee system and for the green one, and never the other way round.
 * @category Filiation
 */
export const transfersOf = (): ReadonlyMap<string, ReadonlySet<string>> => {
    const transfers = new Map<string, Set<string>>()
    for (const procedure of procedures) {
        const match = TRANSFER.exec(procedure.id ?? "")
        if (!match) continue
        const [from, to] = [match[1]!, match[2]!]
        transfers.set(from, new Set([...(transfers.get(from) ?? []), to]))
    }
    return transfers
}

/** Whether a version of the one system can stand above a version of the other: the same system, or one re-cut from it. */
export const leadsTo = (transfers: ReadonlyMap<string, ReadonlySet<string>>, from: string, to: string): boolean =>
    from === to || (transfers.get(from)?.has(to) ?? false)

/**
 * The system of a lost version above versions of the given systems: the
 * one they share, or else the one they were all re-cut from. A lost
 * state above a red and a Licensee version is red, since a Licensee
 * version is never re-cut into red. Where no system leads to all of
 * them, nothing.
 * @category Filiation
 */
export const systemAbove = (transfers: ReadonlyMap<string, ReadonlySet<string>>, systems: ReadonlySet<string>): string | undefined => {
    if (systems.size === 1) return [...systems][0]
    const candidates = new Set([...systems, ...transfers.keys()])
    return [...candidates].sort().find(candidate => [...systems].every(system => leadsTo(transfers, candidate, system)))
}

/** The bar of a system the library knows, by its identifier. */
export const barNamed = (id: string): TrackerBar | undefined => trackerBars.find(bar => bar.id === id)
