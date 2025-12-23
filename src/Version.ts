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

export type VersionType = typeof versionTypes[number];

export type Motivation = WithType<'motivation'> & WithId & WithNote

/**
 * A version is defined by the sum of edits applied 
 * to the version it is based on. For simple identification, 
 * a siglum is given to each version. 
 */
export interface Version {
    id: string // This is the id of the actual version which is R17 created

    /**
     * A short siglum to identify the version, e.g. "A", "B1", B2_rev", etc.
     */
    siglum: string;

    /**
     * If no derivation is defined, it is assumed that this version represents the mother roll
     */
    basedOn?: ReferenceAssumption;
    edits: Edit[];

    /**
     * A collection of motivations used in this version's edits.
     */
    motivations: Motivation[]
    type: VersionType
}

