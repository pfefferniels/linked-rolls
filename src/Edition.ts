import { WithId } from "./utils";
import { DateAssignment, RollCopy } from "./RollCopy";
import { Version } from "./Version";
import { CollationTolerance } from "./Collation";
import { ObjectAssumption } from "./Assumption";

/**
 * A person, e.g. a pianist, editor, publisher, etc.
 * @see crm:E21 Person
 */
export interface Person extends Partial<WithId> {
    /**
     * The full name of the person.
     * @see rdfs:label
     * @example "Grünfeld, Alfred"
     */
    name: string

    /**
     * This property can be used to point to a
     * GND, Wikidata, or similar entry.
     * @see owl:sameAs
     * @example "https://d-nb.info/gnd/116888652"
     */
    sameAs: string[]

    /**
     * The role of the person in the context of the edition,
     * e.g. 'pianist', 'editor', 'publisher', etc.
     * @see crm:P2 has type
     */
    role?: string
}

/**
 * A place, e.g. a recording location, publishing location, etc.
 * @see crm:E53 Place
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
 * @see lrm:F28 Expression Creation
 */
export interface EditionCreation {
    /**
     * The person or institution responsible for publishing the edition.
     * @see crm:P14 carried out by
     */
    publisher: Person

    /**
     * The date on which the edition was published.
     * @format date
     * @see crm:P4 has time-span
     */
    publicationDate: Date

    /**
     * The tolerance parameters used when collating (aligning)
     * the different roll copies for this edition.
     * @see L13 used parameters
     */
    collationTolerance?: CollationTolerance
}

/**
 * Describes the event of recording and documents
 * the persons involved in the process (e.g. pianist),
 * the place, and the date of the recording.
 * @see reo:C14 Recording
 */
export interface RecordingEvent {
    /**
     * Documents the performance which was recorded.
     * @see lrm:R81 recorded
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
     * @see crm:P7 took place at
     */
    place: Place

    /**
     * The recording date of the roll. This is a date
     * assignment so that we can state e.g. the catalogue
     * or the roll label which indicates the date of the recording.
     * @see crm:P4 has time-span
     */
    date: DateAssignment

    /**
     * The version of the roll which was created in
     * the recording. Since it is usually not handed
     * down, this is an optional property.
     * @see lrm:R17 created
     */
    created?: Version
}

/**
 * The abstract concept of a roll, identified
 * by its catalogue number.
 * @see lrm:F1 Work
 */
export interface Roll {
    /**
     * The catalogue number of the roll.
     * @example "WM 225"
     */
    catalogueNumber: string

    /**
     * @see lrm:R19i was realized through
     */
    recordingEvent: RecordingEvent
}

/**
 * The playback tempo of the roll, specified as a starting
 * and ending speed. The tempo may change over the course
 * of the roll due to acceleration effects.
 */
export interface RollTempo {
    /**
     * The tempo at the beginning of the roll.
     */
    startsWith: number;
    /**
     * The tempo at the end of the roll.
     */
    endsWith: number;
    /**
     * The unit of the tempo measurement (e.g. 'ft/min', 'm/min').
     */
    unit: string;
}

/**
 * Describes the specific digital edition of a piano roll.
 * @see lrm:F2 Expression
 */
export interface Edition {
    /**
     * The base URI for all entities in this edition.
     * @example "https://edition.encoded-ghosts.org/wm225"
     */
    base: string

    /**
     * Information about the creation of this edition,
     * including publisher and publication date.
     * @see lrm:R17i was created by
     */
    creation: EditionCreation

    /**
     * The title of the edition.
     * @see crm:P102 has title
     * @example "Alfred Grünfeld spielt Robert Schumann, Träumerei"
     */
    title: string

    /**
     * The license under which the edition is published.
     * @see dcterms:license
     * @example "https://creativecommons.org/licenses/by/4.0/"
     */
    license: string

    /**
     * The roll which is edited in this edition.
     * @see lrm:R3i realises
     */
    roll: Roll

    /**
     * The physical roll copies on which this edition is based.
     */
    copies: RollCopy[]

    /**
     * The different versions of the roll on which
     * this edition is based.
     * @see lrm:R76 is derivative of
     */
    versions: Version[]

    /**
     * An optional tempo adjustment for playback of the roll,
     * annotatable with a belief about its correctness.
     */
    tempoAdjustment?: ObjectAssumption<RollTempo>
}

export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'creation' | 'roll'>