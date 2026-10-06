/** Walking the stemma of an edition along the principal derivations. */
import { Edition } from "../model/Edition.js";
import { principalDerivationOf, Version } from "../model/Version.js";
import { idOf } from "../model/Assumption.js";
import { versionIn } from "../lookup/lookup.js";

/**
 * The version and its ancestors along the principal line, from the
 * version up to the root. A stemma that loops back on itself is walked
 * once round, so that an edition in that state can still be read and
 * repaired.
 * @category Versions and stemma
 */
export const lineageOf = (edition: Pick<Edition, 'versions'>, versionId: string): Readonly<Version>[] => {
    const lineage: Readonly<Version>[] = []
    const visited = new Set<string>()
    let v = versionIn(edition, versionId)
    while (v && !visited.has(v.id)) {
        visited.add(v.id)
        lineage.push(v)
        const principal = principalDerivationOf(v)
        v = principal && versionIn(edition, idOf(principal))
    }
    return lineage
}

/**
 * The version the given one's text is read against, by its principal derivation.
 * @category Versions and stemma
 */
export const predecessorOf = (edition: Pick<Edition, 'versions'>, versionId: string): Readonly<Version> | undefined => {
    const v = versionIn(edition, versionId)
    const principal = v && principalDerivationOf(v)
    return principal && versionIn(edition, idOf(principal))
}

/**
 * Every version with its generation: how many principal derivations
 * lie between it and the root. A version whose parent the edition does
 * not hold counts as a root. In a stemma that loops, the loop is walked
 * once round, as `lineageOf` walks it, so that the stemma of an edition
 * in that state can still be drawn and repaired.
 * @category Versions and stemma
 */
export const withGenerations = (edition: Pick<Edition, 'versions'>): Array<Version & { generation: number }> =>
    edition.versions.map(version => ({
        ...version,
        generation: lineageOf(edition, version.id).length - 1
    }))
