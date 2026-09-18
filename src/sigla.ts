import { idOf } from './Assumption.js'
import { Edition } from './Edition.js'
import { EditionView } from './EditionView.js'
import { systemIdOf } from './TrackerBar.js'
import { trackerBarOf } from './systems/index.js'
import { principalDerivationOf, Version } from './Version.js'
import { attestedVersions } from './witnesses.js'

/** The letter the versions of a system are labelled with. */
const letters: ReadonlyMap<string, string> = new Map([
    ['welte-t100', 'R'],
    ['welte-green', 'G'],
    ['welte-licensee', 'L']
])

/** The letter of a version's system, from the systems the library knows, else from the system's name. */
const letterOf = (version: Version): string => {
    const bar = trackerBarOf(version.system)
    const known = bar && letters.get(bar.id)
    if (known) return known

    const name = (bar?.name ?? version.system?.name ?? '').replace(/[^A-Za-z]/g, '')
    return (name.charAt(0) || 'X').toUpperCase()
}

/**
 * The siglum of every version, as the stemma stands. The letter names the
 * reproducing system a version is coded for, the number counts the
 * generations within that system, and a number after a dot marks a branch
 * that leaves a generation. A version coded for another system than the
 * one it derives from starts that system's next number, since nothing in
 * that system precedes it.
 *
 * The main line runs through the child that has descendants of its own;
 * where several have, the one with the most, and where none has, the line
 * ends and the children hang off it as branches.
 */
const alongTheStemma = (versions: readonly Version[]): ReadonlyMap<string, string> => {
    const byId = new Map(versions.map(version => [version.id, version]))

    const parentOf = (version: Version): Version | undefined => {
        const principal = principalDerivationOf(version)
        const parent = principal && byId.get(idOf(principal))
        return parent === version ? undefined : parent
    }

    const children = new Map<string, Version[]>()
    const roots: Version[] = []
    for (const version of versions) {
        const parent = parentOf(version)
        if (!parent) roots.push(version)
        else children.set(parent.id, [...(children.get(parent.id) ?? []), version])
    }

    const counted = new Map<string, number>()
    const descendants = (version: Version): number => {
        const known = counted.get(version.id)
        if (known !== undefined) return known

        counted.set(version.id, 0)
        const count = (children.get(version.id) ?? []).reduce((sum, child) => sum + 1 + descendants(child), 0)
        counted.set(version.id, count)
        return count
    }

    /** The child the main line runs through: the one of the same system carrying most of the stemma. */
    const mainChildOf = (version: Version): Version | undefined =>
        (children.get(version.id) ?? [])
            .filter(child => systemIdOf(child.system) === systemIdOf(version.system))
            .sort((one, other) => descendants(other) - descendants(one))[0]

    const sigla = new Map<string, string>()
    const taken = new Map<string, number>()
    const branches = new Map<string, number>()

    const nextIn = (letter: string): string => {
        const number = (taken.get(letter) ?? 0) + 1
        taken.set(letter, number)
        return `${letter}${number}`
    }

    const branchOf = (version: Version): string => {
        const number = (branches.get(version.id) ?? 0) + 1
        branches.set(version.id, number)
        return `${sigla.get(version.id)}.${number}`
    }

    const queue = roots.map(version => {
        sigla.set(version.id, nextIn(letterOf(version)))
        return { version, onMainLine: true }
    })

    while (queue.length > 0) {
        const { version, onMainLine } = queue.shift()!
        const main = mainChildOf(version)

        for (const child of children.get(version.id) ?? []) {
            if (sigla.has(child.id)) continue

            const entersSystem = systemIdOf(child.system) !== systemIdOf(version.system)
            const continuesLine = onMainLine && child === main
            sigla.set(child.id, entersSystem || continuesLine ? nextIn(letterOf(child)) : branchOf(version))
            queue.push({ version: child, onMainLine: continuesLine })
        }
    }

    return sigla
}

/**
 * What the sigla are read off: the versions alone, or a view, which knows
 * the copies as well and so can tell which versions a witness shows.
 */
export type Stemma = Pick<Edition, 'versions'> | EditionView

const isView = (stemma: Stemma): stemma is EditionView => !('versions' in stemma)

/**
 * The sigla with the inferred versions in lowercase, as editions mark a
 * state nothing surviving shows. The letter still names the system and
 * the number still counts the generation.
 */
const marking = (sigla: ReadonlyMap<string, string>, attested: ReadonlySet<string>): ReadonlyMap<string, string> =>
    new Map([...sigla].map(([id, siglum]) => [id, attested.has(id) ? siglum : siglum.toLowerCase()]))

/**
 * The siglum of every version, as the stemma stands: where it sits
 * (`alongTheStemma`) and, given a view, whether any copy shows it.
 *
 * A version no copy's features carry at first hand is inferred, whether
 * it is reached only through the versions derived from it or a copy does
 * no more than state that it carries it. Its siglum is lowercased, so
 * that r3 stands to R3 as a reconstructed state stands to a witnessed
 * one. Handed the versions alone, the sigla cannot tell and stay in
 * capitals throughout.
 *
 * A siglum is computed anew when the stemma or the copies change, so
 * nothing should cite one without saying which state it belongs to.
 */
export const siglaOf = (stemma: Stemma): ReadonlyMap<string, string> =>
    isView(stemma)
        ? marking(alongTheStemma(stemma.edition.versions), attestedVersions(stemma))
        : alongTheStemma(stemma.versions)

/** The siglum of one version as the stemma stands, or nothing where the edition holds no such version. */
export const siglumOf = (stemma: Stemma, versionId: string): string | undefined =>
    siglaOf(stemma).get(versionId)
