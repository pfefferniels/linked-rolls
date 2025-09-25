import { WithId } from "./WithId";
import { DateAssignment, RollCopy } from "./RollCopy";
import { Version } from "./Version";
import { CollationTolerance } from "./Collation";
import { Assumption } from "doubtful";

/**
 * A person, e.g. a pianist, editor, publisher, etc.
 * This type refers to crm:E21 Person.
 */
export interface Person extends Partial<WithId> {
    /**
     * The full name of the person.
     * This property refers to rdfs:label.
     * @example "Grünfeld, Alfred"
     */
    name: string

    /**
     * This property can be used to point to a
     * GND, Wikidata, or similar entry.
     * This property refers to owl:sameAs.
     * @example "https://d-nb.info/gnd/116888652"
     */
    sameAs: string[]

    /**
     * The role of the person in the context of the edition,
     * e.g. 'pianist', 'editor', 'publisher', etc.
     * This property refers to crm:P2 has type.
     */
    role?: string
}

/**
 * A place, e.g. a recording location, publishing location, etc.
 * This type refers to a crm:E53 Place.
 */
export interface Place {
    /**
     * The name of the place.
     * @example "Wien"
     */
    name: string

    /**
     * This property can be used to point to a
     * geonames or wikidata entry.
     */
    sameAs: string[] // should point e.g. to geoplaces
}

/**
 * This type describes the creation of an edition,
 * i.e. the editor, publisher, and publication date.
 * This type refers to lrm:F28 Expression Creation.
 */
export interface EditionCreation {
    publisher: Person

    /**
     * @format date
     */
    publicationDate: Date
    collationTolerance?: CollationTolerance // L13 used parameters
}

/**
 * Describes the event of recording and documents 
 * the persons involved in the process (e.g. pianist),
 * the place, and the date of the recording.
 * This type is built on reo:C14 Recording.
 */
export interface RecordingEvent {
    /**
     * Documents the performance which was recorded. 
     * This property is built on lrm:R81 recorded.
     */
    recorded: {
        pianist: Person;

        /**
         * This property should point to a standard 
         * URI, e.g. the GND.
         */
        playing: string;
    }

    /**
     * The place where the recording took place.
     * This property is built on crm:P7 took place at.
     */
    place: Place

    /**
     * The recording date of the roll. This is a date
     * assignment so that we can state e.g. the catalogue
     * or the roll label which indicates the date of the recording.
     * This property is a reified version of crm:P4 has time-span.
     */
    date: DateAssignment

    /**
     * The version of the roll which was created in
     * the recording. Since it is usually not handed
     * down, this is an optional property.
     * This property is built on R17 created.
     */
    created?: Version
}

/**
 * The abstract concept of a roll, identified
 * by its catalogue number.
 * This type refers to lrm:F1 Work.
 */
export interface Roll {
    /**
     * The catalogue number of the roll.
     * @example "WM 225"
     */
    catalogueNumber: string

    /**
     * This property refers to lrm:R19i was realized through
     */
    recordingEvent: RecordingEvent
}

export interface RollTempo {
    startsWith: number;
    endsWith: number;
    unit: string;
}

export type TempoAssignment = Assumption<'tempoAssignment', RollTempo>

/**
 * Describes the specific digital edition of a piano roll.
 * This type refers to lrm:F2 Expression.
 */
export interface Edition {
    /**
     * The base URI for all entities in this edition.
     * @example "https://edition.encoded-ghosts.org/wm225"
     */
    base: string

    creation: EditionCreation

    /**
     * The title of the edition.
     * This property refers to crm:P102 has title.
     * @example "Alfred Grünfeld spielt Robert Schumann, Träumerei"
     */
    title: string

    /**
     * The license under which the edition is published.
     * This property refers to dcterms:license.
     * @example "https://creativecommons.org/licenses/by/4.0/"
     */
    license: string

    /**
     * The roll which is edited in this edition.
     * This property refers to lrm:R3i realises.
     */
    roll: Roll

    copies: RollCopy[]

    /**
     * The different versions of the roll on which
     * this edition is based.
     * This property refers to lrm:R76 is derivative of.
     */
    versions: Version[]
    tempoAdjustment?: TempoAssignment
}

export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'creation' | 'roll'>