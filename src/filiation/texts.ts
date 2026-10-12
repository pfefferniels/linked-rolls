/** Which copies carry the same text, and so one version between them. */
import { PresenceMatrix } from "./presence.js"

/**
 * Copies taken to carry one text: copies of one system, punched from one
 * master, that differ in no more readings than a transcription and the
 * wear of a copy explain.
 * @category Filiation
 */
export interface SharedText {
    /** The copies, in the order the proposal was given them. */
    copies: string[]

    /** The most readings any two of them differ in, where both can tell. */
    differences: number

    /** Whether the edition says so: the copies carry one version at first hand there. */
    stated: boolean
}

/**
 * Two copies of one system the proposal keeps apart, and how many
 * readings they differ in, for the closest pairs: what was near being
 * taken for one text.
 * @category Filiation
 */
export interface KeptApart {
    copies: [string, string]
    differences: number
}

/**
 * How many readings two copies of one system may differ in and still be
 * taken to carry the same text, where nothing else is said. A version
 * can differ from the one it derives from by a handful of edits: WM 225's
 * L2 differs from R4 in seven readings. Copies punched from one master,
 * transcribed with care, differ in fewer.
 * @category Filiation
 */
export const defaultSameText = 3

/** In how many readings the two copies differ where both can tell: one has it, the other lacks it. */
export const differencesBetween = (matrix: PresenceMatrix, one: string, other: string): number => {
    let count = 0
    for (const presence of Object.values(matrix.presence)) {
        const a = presence[one]
        const b = presence[other]
        if ((a === 'present' && b === 'absent') || (a === 'absent' && b === 'present')) count++
    }
    return count
}

/**
 * The copies in groups that carry the same text.
 *
 * Copies of different systems never carry one text, since a version is a
 * reading in one system's words. Copies the edition gives one version at
 * first hand stay together (`stated`). Beyond that, the two groups whose
 * copies differ least are joined first, as long as every copy of the one
 * differs from every copy of the other in no more than `within` readings
 * where both can tell, so that a chain of small differences never joins
 * copies far apart. Ties go to the order the copies were given in.
 * `within` below zero joins only what the edition states.
 * @category Filiation
 */
export const sharedTexts = (
    matrix: PresenceMatrix,
    systems: readonly string[],
    within: number,
    stated: readonly (readonly string[])[] = []
): { texts: SharedText[], apart: KeptApart[] } => {
    const copies = matrix.copies
    const index = new Map(copies.map((copy, i) => [copy, i]))
    const distance = copies.map((one, i) => copies.map((other, j) =>
        i === j ? 0 : j < i ? NaN : differencesBetween(matrix, one, other)))
    const between = (i: number, j: number) => i < j ? distance[i][j] : distance[j][i]

    const groupOf = copies.map((_, i) => i)
    const members = new Map(copies.map((_, i) => [i, [i]]))
    const statedGroups = new Set<number>()
    const join = (a: number, b: number) => {
        const [keep, drop] = a < b ? [a, b] : [b, a]
        for (const i of members.get(drop)!) groupOf[i] = keep
        members.set(keep, [...members.get(keep)!, ...members.get(drop)!].sort((x, y) => x - y))
        members.delete(drop)
    }

    for (const group of stated) {
        const known = group.map(copy => index.get(copy)).filter((i): i is number => i !== undefined)
        for (const i of known.slice(1)) {
            if (systems[i] !== systems[known[0]] || groupOf[i] === groupOf[known[0]]) continue
            join(groupOf[i], groupOf[known[0]])
        }
        if (known.length > 1) statedGroups.add(groupOf[known[0]])
    }

    const pairs: { i: number, j: number, d: number }[] = []
    for (let i = 0; i < copies.length; i++) {
        for (let j = i + 1; j < copies.length; j++) {
            if (systems[i] === systems[j]) pairs.push({ i, j, d: between(i, j) })
        }
    }
    pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j)

    if (within >= 0) {
        for (const { i, j, d } of pairs) {
            if (d > within) break
            const a = groupOf[i]
            const b = groupOf[j]
            if (a === b) continue
            const close = members.get(a)!.every(x => members.get(b)!.every(y => between(x, y) <= within))
            if (!close) continue
            const wasStated = statedGroups.has(a) || statedGroups.has(b)
            join(a, b)
            if (wasStated) statedGroups.add(Math.min(a, b))
        }
    }

    const texts = [...members.entries()]
        .sort(([a], [b]) => a - b)
        .map(([group, list]): SharedText => ({
            copies: list.map(i => copies[i]),
            differences: Math.max(0, ...list.flatMap(x => list.filter(y => y > x).map(y => between(x, y)))),
            stated: statedGroups.has(group)
        }))
    const apart = pairs
        .filter(({ i, j }) => groupOf[i] !== groupOf[j])
        .slice(0, 5)
        .map(({ i, j, d }): KeptApart => ({ copies: [copies[i], copies[j]], differences: d }))
    return { texts, apart }
}
