import { ActorAssignment, Edit } from "./Edit";
import { EditorialAssumption, Motivation } from "./EditorialAssumption";

export type Derivation = EditorialAssumption<'derivation', string>

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

/**
 * Version + Version Creation
 */
export interface Version {
    id: string // This is the id of the actual version which is R17 created
    siglum: string; // the siglum of the version, e.g. P9
    actor?: ActorAssignment
    basedOn?: Derivation; // if no derivation is defined, it is assumed that this version represents the mother roll
    edits: Edit[]; // P9 consists of
    motivations: Motivation<string>[]
    type: VersionType
}


