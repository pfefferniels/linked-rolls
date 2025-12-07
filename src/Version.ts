import { ActorAssignment, Edit } from "./Edit";
import { ObjectAssumption, ReferenceAssumption } from "./Assumption";

export const versionTypes = [
    /**
     * The roll is in a state where it is used as 
     * the master roll for several new reproductions.
     */
    'edition',

    /**
     * This denotes a version which is specific to (early)
     * Welte-Mignon piano rolls, where rolls inteded to 
     * be pulished are revised by a controller first. These
     * rolls typically carry a "controlliert" stamp. The
     * revision is done on the same date as the perforation 
     * and the date is written on the roll towards its end.
     */
    'authorised-revision',

    /**
     * Unauthorised revisions are those, which cannot be linked
     * to a specific controller and are likely done by
     * a later, anonymous hand. 
     */
    'unauthorised-revision',

    /**
     * In the case of Welte Mignon rolls, glosses are
     * typically comments about the roll's condition, added
     * e.g. by the collector.
     */
    'gloss'
] as const

export type VersionType = typeof versionTypes[number];

export type Motivation = ObjectAssumption<{ type: 'motivation', note: string }>

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
     * The person who carried out the edits resulting in this version.
     * This person can be identified only in very rare cases.
     */
    actor?: ActorAssignment

    /**
     * If no derivation is defined, it is assumed that this version represents the mother roll
     */
    basedOn?: ReferenceAssumption;
    edits: Edit[];

    /**
     * The presumed motivations for creating this version.
     */
    motivations: Motivation[]
    type: VersionType
}

