/**
 * The evidence a stemma rests on, worked out from the edition instead
 * of written into the notes of its derivations: which copies carry what
 * a version inserts, and where a version puts back what an ancestor
 * struck. The rules a derivation names (`Inference.applies`) are stated
 * where they are published; this is what they look at.
 */
import { idsOf } from "../model/Assumption.js"
import { Edit, EditType } from "../model/Edit.js"
import { Edition } from "../model/Edition.js"
import { AnySymbol } from "../model/Symbol.js"
import { collationToleranceOf, deletedBy, editsOf, insertedBy, principalDerivationOf, Version } from "../model/Version.js"
import { isCollatable } from "../collation/Collation.js"
import { copyOfFeature, symbolIn, versionIn } from "../lookup/lookup.js"
import { perState } from "../lookup/perState.js"
import { lineageOf } from "./stemma.js"
import { placeOf, snapshotOf } from "./text.js"
import { firstHandVersionOf } from "./witnesses.js"

/**
 * How one copy bears what a version inserts and strikes, as
 * `bearingsOf` reports it.
 *
 * A copy whose line runs through the version should carry every symbol
 * the version inserts, unless a version derived from it on the way to
 * the copy replaced or struck it, and none the version strikes. A copy
 * outside the line should carry none of what the version inserts: only
 * when an insertion is found in several versions at exactly the same
 * place are they bound by a common exemplar. What the copies carry
 * against this is `unaccounted`.
 * @category Analysis
 */
export interface Bearing {
    /** The version, by id. */
    version: string

    /** The copy, by id. */
    copy: string

    /**
     * Whether the copy's line runs through the version: the version the
     * copy bears at first hand is this one or one derived from it.
     */
    inLine: boolean

    /** The version's insertions the copy's features carry. */
    carried: string[]

    /**
     * The version's insertions a later version on the copy's line
     * replaced, the copy carrying what took their place, such as a
     * perforation shifted or recoded for another system.
     */
    replaced: string[]

    /** The version's insertions a later version on the copy's line struck, the copy carrying nothing in their place. */
    struck: string[]

    /** The symbols the version strikes that the copy's features carry. */
    keeps: string[]

    /**
     * What the copy carries against the version's place in the stemma:
     * in the line, an insertion it lacks with nothing to account for it,
     * and a struck symbol it still carries; outside the line, an
     * insertion it carries.
     */
    unaccounted: string[]
}

/** A strike of a symbol: the edit that strikes it and the version the edit belongs to. */
interface Strike {
    version: string
    edit: Edit
}

/** What the copies' features say about each symbol, gathered once for the whole edition. */
interface Readings {
    /** By symbol, the copies whose features carry it. */
    readonly copiesOf: ReadonlyMap<string, ReadonlySet<string>>

    /** By symbol, the edits that strike it. */
    readonly strikesOf: ReadonlyMap<string, readonly Strike[]>

    /** By copy carrying any insertion, its line: the version it bears at first hand and that version's ancestors, the latest first. */
    readonly lineOf: ReadonlyMap<string, readonly string[]>
}

const readingsIn = perState((edition: Edition): Readings => {
    const copiesOf = new Map(edition.versions.flatMap(insertedBy).map(symbol => [
        symbol.id,
        new Set(idsOf(symbol.carriers).flatMap(feature => copyOfFeature(edition, feature)?.id ?? []))
    ]))

    const strikesOf = new Map<string, Strike[]>()
    for (const version of edition.versions) {
        for (const edit of editsOf(version)) {
            for (const id of edit.delete ?? []) {
                strikesOf.set(id, [...strikesOf.get(id) ?? [], { version: version.id, edit }])
            }
        }
    }

    const lineOf = new Map(edition.copies.flatMap(copy => {
        const firstHand = firstHandVersionOf(edition, copy.id)
        return firstHand ? [[copy.id, lineageOf(edition, firstHand).map(version => version.id)] as const] : []
    }))

    return { copiesOf, strikesOf, lineOf }
})

/**
 * Whether the copy carries the symbol, or what one of the versions
 * named put in its place, followed through as many replacements as
 * those versions made. A replacement met twice, which only an edition
 * whose strikes bite nothing can hold, is followed once.
 */
const reaches = (
    readings: Readings, symbol: string, copy: string, below: readonly string[], seen = new Set<string>()
): boolean => {
    if (readings.copiesOf.get(symbol)?.has(copy)) return true
    if (seen.has(symbol)) return false
    seen.add(symbol)

    return (readings.strikesOf.get(symbol) ?? [])
        .filter(strike => below.includes(strike.version))
        .some(strike => (strike.edit.insert ?? []).some(other => reaches(readings, other.id, copy, below, seen)))
}

const bearingIn = (readings: Readings, version: Readonly<Version>, copy: string, line: readonly string[]): Bearing => {
    const inLine = line.includes(version.id)
    const below = inLine ? line.slice(0, line.indexOf(version.id)) : []
    const bearing: Bearing = {
        version: version.id, copy, inLine, carried: [], replaced: [], struck: [], keeps: [], unaccounted: []
    }

    for (const symbol of insertedBy(version)) {
        if (readings.copiesOf.get(symbol.id)?.has(copy)) {
            bearing.carried.push(symbol.id)
            if (!inLine) bearing.unaccounted.push(symbol.id)
        }
        else if (!inLine) continue
        else if (reaches(readings, symbol.id, copy, below)) bearing.replaced.push(symbol.id)
        else if ((readings.strikesOf.get(symbol.id) ?? []).some(strike => below.includes(strike.version))) bearing.struck.push(symbol.id)
        else bearing.unaccounted.push(symbol.id)
    }

    for (const id of deletedBy(version)) {
        if (!readings.copiesOf.get(id)?.has(copy)) continue
        bearing.keeps.push(id)
        if (inLine) bearing.unaccounted.push(id)
    }

    return bearing
}

/**
 * How each copy bears what the version inserts and strikes, for every
 * copy whose features carry an insertion of any version, in the order
 * the edition lists the copies. Together, the bearings of all
 * versions are the evidence for the stemma that the rule of shared
 * additions looks at: a version is bound to its copies by what it
 * inserts and they alone carry. A copy known only by a statement that
 * it carries a version has no features to bear anything and is left
 * out.
 * @category Analysis
 */
export const bearingsOf = (edition: Edition, versionId: string): Bearing[] => {
    const version = versionIn(edition, versionId)
    if (!version) return []

    const readings = readingsIn(edition)
    return [...readings.lineOf].map(([copy, line]) => bearingIn(readings, version, copy, line))
}

/**
 * One of a version's insertions that collates with a symbol an
 * ancestor of the version struck, as `restorationsOf` reports it.
 * @category Analysis
 */
export interface Restoration {
    /** The version's insertion, by id. */
    symbol: string

    /** The struck symbol it collates with, by id. */
    restores: string

    /** The ancestor that struck it. */
    struckBy: string

    /**
     * The version the edition holds this one may also derive from,
     * whose text still shows the struck symbol, where there is one. A
     * restoration it accounts for is a reading taken from a second
     * exemplar rather than one made anew.
     */
    from?: string
}

/**
 * The version's insertions that put back, at the same place, a symbol
 * one of its ancestors struck, each with the derivation that accounts
 * for it where the edition holds one. A version derived from a single
 * exemplar does not do that, since an editor making the same addition at
 * the same place again by chance is very unlikely, so a restoration is
 * evidence of a second exemplar. "The same place" is the window the
 * version was collated at against its parent.
 * @category Analysis
 */
export const restorationsOf = (edition: Edition, versionId: string): Restoration[] => {
    const version = versionIn(edition, versionId)
    const principal = version && principalDerivationOf(version)
    if (!version || !principal) return []

    const struck = lineageOf(edition, versionId).slice(1).flatMap(ancestor =>
        deletedBy(ancestor).flatMap(id => {
            const symbol = symbolIn(edition, id)
            return symbol ? [{ symbol, struckBy: ancestor.id }] : []
        }))
    if (struck.length === 0) return []

    const tolerance = collationToleranceOf(principal)
    const locate = (symbol: AnySymbol) => placeOf(edition, symbol)
    const others = (version.basedOn ?? []).filter(derivation => derivation !== principal)
    const keptBy = (symbol: string) => others.find(derivation =>
        snapshotOf(edition, derivation.id).some(shown => shown.id === symbol))?.id

    return insertedBy(version).flatMap(symbol => struck
        .filter(({ symbol: other }) => isCollatable(symbol, other, locate, tolerance))
        .map(({ symbol: other, struckBy }): Restoration => {
            const from = keptBy(other.id)
            return { symbol: symbol.id, restores: other.id, struckBy, ...(from && { from }) }
        }))
}

/**
 * How many of the version's edits state each type, those stating none
 * counted under `undefined`. Read from the version against the one it
 * derives from, the types say which way the text was worked on, as the
 * rule that later versions refine the dynamics looks at.
 * @category Analysis
 */
export const editTypesOf = (version: Readonly<Version>): ReadonlyMap<EditType | undefined, number> =>
    editsOf(version).reduce(
        (counts, edit) => counts.set(edit.editType, (counts.get(edit.editType) ?? 0) + 1),
        new Map<EditType | undefined, number>())

/**
 * Where the copies or a version's insertions speak against the stemma,
 * as `filiationProblems` reports it: the version and the symbol
 * concerned, the copy where a copy is, and what is wrong.
 * @category Analysis
 */
export type FiliationProblem = {
    version: string
    symbol: string
    copy?: string
    problem:
        | 'missing-from-its-line'
        | 'struck-yet-carried'
        | 'carried-outside-its-line'
        | 'restores-a-strike'
}

/**
 * Where the copies or a version's insertions speak against the stemma:
 * an insertion a copy of the version's line lacks with nothing to
 * account for it, a struck symbol a copy of the line still carries, an
 * insertion a copy outside the line carries, and an insertion that puts
 * back what an ancestor struck where no second derivation of the
 * version accounts for it.
 * @category Analysis
 */
export const filiationProblems = (edition: Edition): FiliationProblem[] =>
    edition.versions.flatMap(version => [
        ...bearingsOf(edition, version.id).flatMap(bearing =>
            bearing.unaccounted.map((symbol): FiliationProblem => ({
                version: version.id,
                symbol,
                copy: bearing.copy,
                problem: !bearing.inLine
                    ? 'carried-outside-its-line'
                    : bearing.keeps.includes(symbol) ? 'struck-yet-carried' : 'missing-from-its-line'
            }))),
        ...restorationsOf(edition, version.id)
            .filter(restoration => restoration.from === undefined)
            .map((restoration): FiliationProblem => ({
                version: version.id, symbol: restoration.symbol, problem: 'restores-a-strike'
            }))
    ])
