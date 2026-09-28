import { Belief, Certainty, certaintyOf, idOf, idsOf } from "../model/Assumption.js";
import { AnySymbol } from "../model/Symbol.js";
import { insertedBy } from "../model/Version.js";
import { lineageOf } from "./stemma.js";
import { copyOfFeature, versionIn } from "../lookup/lookup.js";
import { Edition } from "../model/Edition.js";
import { perState } from "../lookup/perState.js";

export type WitnessBy = 'carriers' | 'statement'

/** A copy that bears witness to a version, and how. */
export interface Witness {
    /** The copy, by id. */
    copy: string

    /** Whether the copy's features carry what the version inserts, or the copy states that it carries the version. */
    by: WitnessBy

    /**
     * The later version this copy reaches the version through, where its
     * features carry what a version derived from this one inserts. It then
     * attests the text only as that later version passed it on. A copy
     * that bears witness at first hand names none.
     */
    through?: string

    /** How certainly a statement is held. Carriage through features is no statement and holds none. */
    certainty?: Certainty

    /** The belief a statement rests on, where it states one. */
    belief?: Belief
}

/** The copies whose features carry any of the symbols. */
const copiesCarrying = (edition: Edition, symbols: readonly AnySymbol[]): Set<string> =>
    new Set(symbols
        .flatMap(symbol => idsOf(symbol.carriers))
        .flatMap(id => {
            const copy = copyOfFeature(edition, id)
            return copy ? [copy.id] : []
        }))

/** A copy whose features carry what a version inserts, with how far down its line that version stands. */
interface Carriage {
    copy: string
    version: string
    depth: number
}

/** Every copy carrying what a version inserts, version by version, the copies in the order the edition lists them. */
const carriagesIn = (edition: Edition): Carriage[] =>
    edition.versions.flatMap(version => {
        const carrying = copiesCarrying(edition, insertedBy(version))
        const depth = lineageOf(edition, version.id).length
        return edition.copies
            .filter(copy => carrying.has(copy.id))
            .map((copy): Carriage => ({ copy: copy.id, version: version.id, depth }))
    })

/** What the copies' features attest, gathered once for the whole edition. */
interface Carriers {
    /** By version, the copies whose features carry what it inserts. */
    readonly copiesOf: ReadonlyMap<string, readonly string[]>

    /** By copy, the latest version whose insertions it carries: the state it attests at first hand. */
    readonly latestOf: ReadonlyMap<string, string>
}

/** What the copies' features attest, worked out once for each state of the edition. */
const carriersIn = perState((edition: Edition): Carriers => {
    const carriages = carriagesIn(edition)
    const byVersion = Map.groupBy(carriages, carriage => carriage.version)
    return {
        copiesOf: new Map(edition.versions.map(version => [
            version.id,
            (byVersion.get(version.id) ?? []).map(carriage => carriage.copy)
        ])),
        // Written in order of depth, so a copy's latest carriage is set last and stands.
        latestOf: new Map([...carriages]
            .sort((one, other) => one.depth - other.depth)
            .map(carriage => [carriage.copy, carriage.version]))
    }
})

/**
 * The versions a copy's features carry at first hand: for every copy,
 * the latest state it bears. A version left out is reached only through
 * the versions derived from it, or is attested by statement alone, and
 * its text is a reconstruction rather than a reading.
 */
export const attestedVersions = (edition: Edition): ReadonlySet<string> =>
    new Set(carriersIn(edition).latestOf.values())

const witnessesIn = (carriers: Carriers, edition: Edition, versionId: string): Witness[] => {
    const carrying = carriers.copiesOf.get(versionId) ?? []
    const byCarriers = carrying.map((copy): Witness => {
        const latest = carriers.latestOf.get(copy)
        return { copy, by: 'carriers', ...(latest !== undefined && latest !== versionId && { through: latest }) }
    })
    const carryingIt = new Set(carrying)
    const byStatement = edition.copies
        .filter(copy => !carryingIt.has(copy.id))
        .flatMap(copy => (copy.carries ?? [])
            .filter(statement => idOf(statement) === versionId)
            .map((statement): Witness => {
                const belief = statement['@annotation']?.belief
                return { copy: copy.id, by: 'statement', certainty: certaintyOf(statement), ...(belief && { belief }) }
            }))

    return [...byCarriers, ...byStatement]
}

/**
 * The copies that bear witness to the version: those whose features carry
 * a symbol the version's own edits insert, and those that state they carry
 * it, with the certainty each statement is held with.
 *
 * What a version inherits is carried by nearly every copy of the roll, so
 * only what it inserts tells its witnesses apart from its ancestors'. Its
 * insertions are in turn inherited downwards, and the copies of the
 * versions derived from it carry them as well. Those bear witness to it
 * only through the latest state they carry, which `through` names; a copy
 * carrying nothing a later version inserts speaks for the version at first
 * hand. A version no copy attests at first hand survives, as a lost state
 * does, in what its descendants passed on.
 *
 * A statement is the editor's own about the version it names and is
 * reported as it stands. A version whose edits are not stated inserts
 * nothing and is witnessed by statement alone.
 */
export const witnessesOf = (edition: Edition, versionId: string): Witness[] =>
    versionIn(edition, versionId) ? witnessesIn(carriersIn(edition), edition, versionId) : []

/**
 * The versions the copy bears witness to, each with how, in the order the
 * edition lists its versions.
 */
export const versionsWitnessedBy = (edition: Edition, copyId: string): (Witness & { version: string })[] => {
    const carriers = carriersIn(edition)
    return edition.versions.flatMap(version => witnessesIn(carriers, edition, version.id)
        .filter(witness => witness.copy === copyId)
        .map(witness => ({ ...witness, version: version.id })))
}

export type CarriageProblem = {
    copy: string
    version: string
    problem: 'stated-beside-carriers' | 'version-missing'
}

/**
 * Where a copy's statement that it carries a version cannot stand: one
 * made although the copy's features carry symbols, which say by
 * themselves what it carries, and one naming a version the edition lacks.
 */
export const carriageProblems = (edition: Edition): CarriageProblem[] => {
    const carrying = copiesCarrying(edition, edition.versions.flatMap(insertedBy))

    return edition.copies.flatMap(copy => (copy.carries ?? []).flatMap((statement): CarriageProblem[] => {
        const version = idOf(statement)
        return [
            ...(carrying.has(copy.id) ? [{ copy: copy.id, version, problem: 'stated-beside-carriers' as const }] : []),
            ...(versionIn(edition, version) ? [] : [{ copy: copy.id, version, problem: 'version-missing' as const }])
        ]
    }))
}
