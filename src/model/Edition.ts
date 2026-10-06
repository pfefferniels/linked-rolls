import { featuresOf, RollCopy } from "./RollCopy.js";
import { Version } from "./Version.js";
import { DateAssignment } from "./Assumption.js";
import { Editor, Person, Place } from "./Agent.js";

/**
 * This type describes the creation of an edition,
 * i.e. the editor, publisher, and publication date.
 * @see lrmoo:F28 Expression Creation
 * @category Format types
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
     * The date on which the edition was published: where it states a
     * version, the date of that version.
     * @format date
     * @see dcterms:date
     */
    publicationDate: Date
}

/**
 * Describes the event of recording and documents
 * the persons involved in the process (e.g. pianist),
 * the place, and the date of the recording.
 * @see lrmoo:F28 Expression Creation
 * @category Format types
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
     * @see crm:P4 has time-span
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
 * @category Format types
 */
export interface Roll {
    /**
     * The catalogue number of the roll.
     * @example "WM 225"
     * @see dcterms:identifier
     */
    catalogueNumber: string

    /**
     * @see lrmoo:R19i was realised through
     */
    recordingEvent: RecordingEvent
}

/**
 * Describes the specific digital edition of a piano roll.
 * @see lrmoo:F2 Expression
 * @category Format types
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
     * The version of the edition, which a citation names together with
     * the publication date. The editor raises it for each release and
     * sets the publication date with it, so that what a reader cited can
     * be told from what has changed since. An edition published before
     * this field existed states none.
     * @see owl:versionInfo
     * @example "1.0"
     */
    version?: string

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
     * The copy whose millimetres are the edition's axis, by id: every
     * place the edition gives along the roll is a place on this copy's
     * paper, counted from where its scan begins, and every other copy is
     * aligned onto it. Choosing it is the one editorial decision the
     * alignment leaves; a copy scanned whole and without tears serves
     * best, since its places are what notes and readers cite. Left out,
     * it is the first copy with features that is not aligned
     * (`referenceCopyOf`).
     * @see reo:referenceCopy
     */
    referenceCopy?: string

    /**
     * The different versions of the roll on which
     * this edition is based.
     * @see lrmoo:R75 incorporates
     */
    versions: Version[]
}

/**
 * What an edition states about itself rather than about the copies and
 * versions of the roll: `base`, `title`, `license`, `version`,
 * `creation` and the `roll` it edits.
 * @category Format types
 */
export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'version' | 'creation' | 'roll'>

/**
 * The copy whose millimetres are the edition's axis: the one it names,
 * or where it names none or one it no longer has, the first copy with
 * features that is not aligned, which is how an edition stood before it
 * named one.
 * @category Lookups
 */
export const referenceCopyOf = (edition: Pick<Edition, 'copies' | 'referenceCopy'>): RollCopy | undefined =>
    edition.copies.find(copy => copy.id === edition.referenceCopy)
    ?? edition.copies.find(copy => !copy.measurements.alignment && featuresOf(copy).length > 0)
