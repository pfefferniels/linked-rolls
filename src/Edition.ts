import { RollCopy } from "./RollCopy";
import { Version } from "./Version";
import { CollationTolerance } from "./Collation";
import { DateAssignment, ObjectAssumption } from "./Assumption";
import { Concept, Editor, Person, Place } from "./Agent";
import { RollTempo } from "./ReproducingSystem";

/**
 * This type describes the creation of an edition,
 * i.e. the editor, publisher, and publication date.
 * @see lrmoo:F28 Expression Creation
 */
export interface EditionCreation {
    /**
     * The persons who prepared the edition, each with the part
     * they took in the editorial work. An edition written before
     * this field existed carries none.
     * @see crm:P14 carried out by
     */
    editors?: Editor[]

    /**
     * The person or institution responsible for publishing the edition.
     * @see crm:P14 carried out by
     */
    publisher: Person

    /**
     * The date on which the edition was published.
     * @format date
     * @see dcterms:date
     */
    publicationDate: Date

    /**
     * The tolerance parameters used when collating (aligning)
     * the different roll copies for this edition.
     * Not exported to RDF.
     */
    collationTolerance?: CollationTolerance
}

/**
 * Describes the event of recording and documents
 * the persons involved in the process (e.g. pianist),
 * the place, and the date of the recording.
 * @see lrmoo:F28 Expression Creation
 */
export interface RecordingEvent {
    /**
     * Documents the performance which was recorded.
     * @see lrmoo:R81 recorded
     */
    recorded: {
        /**
         * The pianist who gave the recorded performance.
         * @see crm:P14 carried out by
         */
        pianist: Person;

        /**
         * This property should point to a standard
         * URI, e.g. the GND.
         * @see lrmoo:R80 performed
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
     * @see dcterms:date
     */
    date: DateAssignment

    /**
     * The version of the roll which was created in
     * the recording. Since it is usually not handed
     * down, this is an optional property.
     * @see lrmoo:R17 created
     */
    created?: Version
}

/**
 * The abstract concept of a roll, identified
 * by its catalogue number.
 * @see lrmoo:F1 Work
 */
export interface Roll {
    /**
     * The catalogue number of the roll.
     * @example "WM 225"
     * @see dcterms:identifier
     */
    catalogueNumber: string

    /**
     * The reproducing system the roll was cut for. A system the
     * type vocabulary knows carries the IRI of its concept as `id`,
     * from which the export takes the system's own context, so that
     * the expression types are read as that system's.
     * @see crm:P2 has type
     */
    system: Concept

    /**
     * @see lrmoo:R19i was realised through
     */
    recordingEvent: RecordingEvent
}

/**
 * Describes the specific digital edition of a piano roll.
 * @see lrmoo:F2 Expression
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
     * @see lrmoo:R17i was created by
     */
    creation: EditionCreation

    /**
     * The title of the edition.
     * @see dcterms:title
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
     * @see lrmoo:R3i realises
     */
    roll: Roll

    /**
     * The physical roll copies on which this edition is based.
     * @see reo:witness
     */
    copies: RollCopy[]

    /**
     * The different versions of the roll on which
     * this edition is based.
     * @see lrmoo:R75 incorporates
     */
    versions: Version[]

    /**
     * An optional tempo adjustment for playback of the roll,
     * annotatable with a belief about its correctness.
     * @see reo:tempo
     */
    tempoAdjustment?: ObjectAssumption<RollTempo>
}

export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'creation' | 'roll'>