import { Edit } from "./Edit";
import { ReferenceAssumption } from "./Assumption";
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
 * @see crm:E73 Information Object
 */
export type Motivation = WithType<'motivation'> & WithId & WithNote

/**
 * A version is defined by the sum of edits applied
 * to the version it is based on. For simple identification,
 * a siglum is given to each version.
 */
export interface Version {
    id: string // This is the id of the actual version which is R17 created

    /**
     * A short siglum to identify the version, e.g. "A", "B1", "B2_rev", etc.
     */
    siglum: string;

    /**
     * If no derivation is defined, it is assumed that this version represents the mother roll.
     */
    basedOn?: ReferenceAssumption;

    /**
     * The list of edits that, applied to the base version, produce this version.
     */
    edits: Edit[];

    /**
     * A collection of motivations used in this version's edits.
     */
    motivations: Motivation[]
    type: VersionType
}

