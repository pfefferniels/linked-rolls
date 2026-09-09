import { Edit } from "./Edit";
import { Concept } from "./Agent";
import { ReferenceAssumption } from "./Assumption";
import { CollationTolerance, defaultCollationTolerance } from "./Collation";
import { AnySymbol } from "./Symbol";
import { WithId, WithNote, WithType } from "./utils";

export const versionTypes = [
    /**
     * The roll is in a state where it is (possibly) used as
     * the master roll for several new reproductions.
     */
    'edition',

    /**
     * A version that exists only on one specific copy of a roll.
     */
    'unicum'
] as const

/**
 * The type of a version. An 'edition' version may serve as the
 * master for several roll copies; a 'unicum' version exists only
 * on one specific copy.
 */
export type VersionType = typeof versionTypes[number];

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
     */
    collationTolerance?: CollationTolerance
}

/** The tolerance the derivation was collated at, or the default where it states none. */
export const collationToleranceOf = (derivation: Readonly<Derivation>): CollationTolerance =>
    derivation.collationTolerance ?? defaultCollationTolerance

/**
 * A version is defined by the sum of edits applied
 * to the version it is based on. For simple identification,
 * a siglum is given to each version.
 * @see lrmoo:F2 Expression
 */
export interface Version extends WithId, WithType<'Version'> {
    /**
     * A short siglum to identify the version, e.g. "A", "B1", "B2_rev", etc.
     * @see reo:siglum
     */
    siglum: string;

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
     * Whether the version served as a master for reproductions
     * or exists on one copy only.
     * @see crm:P2 has type
     */
    versionType: VersionType

    /**
     * If no derivation is defined, it is assumed that this version represents the mother roll.
     * @see lrmoo:R76 is derivative of
     */
    basedOn?: Derivation;

    /**
     * The list of edits that, applied to the base version, produce this version.
     * @see reo:involvedEdit
     */
    edits: Edit[];

    /**
     * A collection of motivations used in this version's edits.
     */
    motivations: Motivation[]
}

/** The symbols the version's edits insert. */
export const insertedBy = (version: Readonly<Version>): AnySymbol[] =>
    version.edits.flatMap(edit => edit.insert ?? [])

/** The ids of the symbols the version's edits delete. */
export const deletedBy = (version: Readonly<Version>): string[] =>
    version.edits.flatMap(edit => edit.delete ?? [])
