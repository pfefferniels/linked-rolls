import { Edit } from "./Edit";
import { Concept } from "./Agent";
import { ActorAssignment, Belief, certainties, certaintyOf, Certainty, DateAssignment, idOf, ObjectAssumption, ReferenceAssumption } from "./Assumption";
import { CollationTolerance, defaultCollationTolerance } from "./Collation";
import { AnySymbol } from "./Symbol";
import { WithId, WithNote, WithType } from "./utils";

/**
 * A motivation provides a reason or rationale for an editorial change.
 * Motivations are defined at the version level and referenced by edits.
 * @see crm:E33 Linguistic Object
 */
export type Motivation = WithType<'motivation'> & WithId & WithNote

/**
 * A derivation names the version another one was derived from, together
 * with the tolerance the two were collated at. How precisely the copies
 * put a symbol depends on what they are and on how their features were
 * obtained, so the tolerance can differ from derivation to derivation.
 * @see lrmoo:R76 is derivative of
 */
export type Derivation = ReferenceAssumption & {
    /**
     * The tolerance at which the derived version was collated against
     * the one it is based on. A derivation written before the tolerance
     * was held here states none. Not exported to RDF.
     *
     * It is an object assumption, so that a tolerance calculated from
     * the scatter of the readings can carry the inference it was drawn
     * by. It is the one quantity in the edition that decides what
     * counts as a reading at all, and a number arrived at by a method
     * should say so.
     */
    collationTolerance?: ObjectAssumption<CollationTolerance>
}

/** The tolerance the derivation was collated at, or the default where it states none. */
export const collationToleranceOf = (derivation: Readonly<Derivation>): CollationTolerance =>
    derivation.collationTolerance ?? defaultCollationTolerance

/**
 * How a version was made, where that is known and worth stating.
 *
 * A roll issued for another system was re-punched by an editor of the
 * publisher's, and that was an editorial act rather than a conversion:
 * Lawson names Kähle as the man who corrected second masters for the
 * green system. The rule he worked by is the procedure named here, and
 * the version's edits carry it out, so the mechanical part of a
 * transfer is stated once instead of being spelled out per note.
 * @see lrmoo:F28 Expression Creation
 */
export interface VersionCreation {
    /**
     * Who carried the act out. An `ObjectAssumption`, so an attribution
     * can carry the belief it rests on and the reasons for it.
     * @see crm:P14 carried out by
     */
    actor?: ActorAssignment

    /**
     * When it took place.
     * @see crm:P4 has time-span
     */
    date?: DateAssignment

    /**
     * The rule followed, as a term of the vocabulary: the notes stand
     * at their pitch, the expression is re-spelled in the other
     * system's words.
     * @see crm:P33 used specific technique
     */
    procedure?: Concept
}

/**
 * A version is defined by the sum of edits applied to the version it is
 * based on. What it is called is not stored with it: `siglaOf` reads the
 * sigla off the stemma, so that a label never outlives the arrangement
 * it describes.
 * @see lrmoo:F2 Expression
 */
export interface Version extends WithId, WithType<'Version'> {
    /**
     * The reproducing system this version is coded for. One roll was
     * often issued for several of them, and a version is a reading in
     * one system's words: its expression types are that system's
     * vocabulary and its notes sit on that bar's positions. A system
     * the type vocabulary knows carries the IRI of its concept as
     * `id`, from which the export takes the system's own context.
     * @see crm:P2 has type
     */
    system: Concept

    /**
     * The versions this one is held to derive from, each under the
     * belief it rests on. The text is read against the principal one
     * (`principalDerivationOf`); the others stand as hypotheses, such as
     * a contamination. A version that names none represents the mother
     * roll.
     * @see lrmoo:R76 is derivative of
     */
    basedOn?: Derivation[];

    /**
     * The act that made this version, where it is known: who carried it
     * out, when, and by what rule.
     * @see lrmoo:R17i was created by
     */
    creation?: VersionCreation;

    /**
     * The list of edits that, applied to the base version, produce this
     * version. A hypothetical version whose changes nobody can state
     * leaves it out; it then reads as the version it derives from.
     * @see reo:involvedEdit
     */
    edits?: Edit[];

    /**
     * A collection of motivations used in this version's edits.
     */
    motivations: Motivation[]
}

/** The edits the version states, none where it leaves its text unstated. */
export const editsOf = (version: Readonly<Version>): Edit[] => version.edits ?? []

/** The symbols the version's edits insert. */
export const insertedBy = (version: Readonly<Version>): AnySymbol[] =>
    editsOf(version).flatMap(edit => edit.insert ?? [])

/** The ids of the symbols the version's edits delete. */
export const deletedBy = (version: Readonly<Version>): string[] =>
    editsOf(version).flatMap(edit => edit.delete ?? [])

/**
 * The parents the version names, in the order of `basedOn`, each with the
 * certainty its derivation is held with and the belief it rests on.
 */
export const derivationsOf = (version: Readonly<Version>): { parent: string, certainty: Certainty, belief?: Belief }[] =>
    (version.basedOn ?? []).map(derivation => {
        const belief = derivation['@annotation']?.belief
        return { parent: idOf(derivation), certainty: certaintyOf(derivation), ...(belief && { belief }) }
    })

const rankOf = (derivation: Readonly<Derivation>): number => certainties.indexOf(certaintyOf(derivation))

/**
 * The derivation the version's text is read against: the first of those
 * held most certain. One held unlikely or false is a rejected hypothesis
 * and gives no text. Lowering the certainty of the principal derivation
 * below another's reads the version's edits against another parent.
 */
export const principalDerivationOf = (version: Readonly<Version>): Readonly<Derivation> | undefined =>
    (version.basedOn ?? [])
        .filter(derivation => rankOf(derivation) <= certainties.indexOf('possible'))
        .reduce<Readonly<Derivation> | undefined>(
            (principal, derivation) =>
                principal === undefined || rankOf(derivation) < rankOf(principal) ? derivation : principal,
            undefined)
