import { Belief, Certainty, certaintyOf, idOf, idsOf } from "./Assumption";
import { EditionView } from "./EditionView";
import { AnySymbol } from "./Symbol";
import { insertedBy, Version } from "./Version";

export type WitnessBy = 'carriers' | 'statement'

/** A copy that bears witness to a version, and how. */
export interface Witness {
    /** The copy, by id. */
    copy: string

    /** Whether the copy's features carry what the version inserts, or the copy states that it carries the version. */
    by: WitnessBy

    /** How certainly a statement is held. Carriage through features is no statement and holds none. */
    certainty?: Certainty

    /** The belief a statement rests on, where it states one. */
    belief?: Belief
}

/** The copies whose features carry any of the symbols. */
const copiesCarrying = (view: EditionView, symbols: readonly AnySymbol[]): Set<string> =>
    new Set(symbols
        .flatMap(symbol => idsOf(symbol.carriers))
        .flatMap(id => {
            const copy = view.copyOf(id)
            return copy ? [copy.id] : []
        }))

/**
 * The copies that bear witness to the version: those whose features carry
 * a symbol the version's own edits insert, and those that state they carry
 * it, with the certainty each statement is held with.
 *
 * What a version inherits is carried by nearly every copy of the roll, so
 * only what it inserts tells its witnesses apart. A version whose edits
 * are not stated is witnessed by statement alone.
 */
export const witnessesOf = (view: EditionView, versionId: string): Witness[] => {
    const version = view.get<Version>(versionId)
    if (!version) return []

    const carrying = copiesCarrying(view, insertedBy(version))
    const byCarriers = view.edition.copies
        .filter(copy => carrying.has(copy.id))
        .map((copy): Witness => ({ copy: copy.id, by: 'carriers' }))
    const byStatement = view.edition.copies
        .filter(copy => !carrying.has(copy.id))
        .flatMap(copy => (copy.carries ?? [])
            .filter(statement => idOf(statement) === versionId)
            .map((statement): Witness => {
                const belief = statement['@annotation']?.belief
                return { copy: copy.id, by: 'statement', certainty: certaintyOf(statement), ...(belief && { belief }) }
            }))

    return [...byCarriers, ...byStatement]
}

/**
 * The versions the copy bears witness to, each with how, in the order the
 * edition lists its versions.
 */
export const versionsWitnessedBy = (view: EditionView, copyId: string): (Witness & { version: string })[] =>
    view.edition.versions.flatMap(version => witnessesOf(view, version.id)
        .filter(witness => witness.copy === copyId)
        .map(witness => ({ ...witness, version: version.id })))

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
export const carriageProblems = (view: EditionView): CarriageProblem[] => {
    const carrying = copiesCarrying(view, view.edition.versions.flatMap(insertedBy))

    return view.edition.copies.flatMap(copy => (copy.carries ?? []).flatMap((statement): CarriageProblem[] => {
        const version = idOf(statement)
        return [
            ...(carrying.has(copy.id) ? [{ copy: copy.id, version, problem: 'stated-beside-carriers' as const }] : []),
            ...(view.get<Version>(version)?.type === 'Version' ? [] : [{ copy: copy.id, version, problem: 'version-missing' as const }])
        ]
    }))
}
