/** What tells two states of a stemma apart, version by version. */
import { Edition } from "../model/Edition.js"
import { idOf } from "../model/Assumption.js"
import { deletedBy, insertedBy, principalDerivationOf, Version } from "../model/Version.js"

/**
 * How a version differs between two states of the edition: whether it
 * is in either, what it derives from in each, and which symbols it
 * inserts and deletes in one and not the other.
 * @category Filiation
 */
export interface VersionChange {
    version: string
    /** The version it derives from in the state before, where it is in that state. */
    parentBefore?: string | null
    /** The version it derives from in the state after, where it is in that state. */
    parentAfter?: string | null
    inserted: { kept: number, gone: string[], added: string[] }
    deleted: { kept: number, gone: string[], added: string[] }
}

const compared = (before: readonly string[], after: readonly string[]) => {
    const was = new Set(before)
    const is = new Set(after)
    return {
        kept: after.filter(id => was.has(id)).length,
        gone: before.filter(id => !is.has(id)),
        added: after.filter(id => !was.has(id))
    }
}

const parentOf = (version: Version): string | null => {
    const principal = principalDerivationOf(version)
    return principal ? idOf(principal) : null
}

/**
 * Version by version, how the stemma of one state of the edition differs
 * from that of another, as when a proposed stemma is set against the one
 * the edition holds. The versions of the state before come first, in
 * their order, then those only the state after holds.
 * @category Filiation
 */
export const stemmaChanges = (before: Pick<Edition, 'versions'>, after: Pick<Edition, 'versions'>): VersionChange[] => {
    const was = new Map(before.versions.map(version => [version.id, version]))
    const is = new Map(after.versions.map(version => [version.id, version]))
    const ids = [...new Set([...was.keys(), ...is.keys()])]
    return ids.map(id => {
        const one = was.get(id)
        const other = is.get(id)
        return {
            version: id,
            ...(one && { parentBefore: parentOf(one) }),
            ...(other && { parentAfter: parentOf(other) }),
            inserted: compared(one ? insertedBy(one).map(symbol => symbol.id) : [], other ? insertedBy(other).map(symbol => symbol.id) : []),
            deleted: compared(one ? deletedBy(one) : [], other ? deletedBy(other) : [])
        }
    })
}
