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
 * @see crm:E33 Linguistic Object
 */
export type Motivation = WithType<'motivation'> & WithId & WithNote

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
     * Whether the version served as a master for reproductions
     * or exists on one copy only.
     * @see crm:P2 has type
     */
    versionType: VersionType

    /**
     * If no derivation is defined, it is assumed that this version represents the mother roll.
     * @see lrmoo:R76 is derivative of
     */
    basedOn?: ReferenceAssumption;

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
