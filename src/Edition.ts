import { EditorialAssumption, QuestionMaking } from "./EditorialAssumption";
import { WithId } from "./WithId";
import { DateAssignment, RollCopy } from "./RollCopy";
import { Version } from "./Version";
import { CollationTolerance } from "./Collation";

// E21 Person
export interface Person extends Partial<WithId> {
    name: string // rdfs:label
    sameAs: string[] // owl:sameAs - might link to GND, Wikidata, etc.
    role?: string // e.g. 'pianist', 'editor', 'publisher', etc.
}

// E53 Place
export interface Place {
    name: string 
    sameAs: string[] // should point e.g. to geoplaces
}

// F28 Expression Creation and D10 Software Execution
export interface EditionCreation {
    publisher: Person
    publicationDate: Date
    collationTolerance?: CollationTolerance // L13 used parameters
    questions: QuestionMaking[] // P9 consists of
}

export interface RecordingEvent {
    recorded: { // R20 recorded => F31 Performance
        pianist: Person;
        playing: string;    // should point to GND
    }
    place: Place

    /**
     * The recording date of the roll. This is a date
     * assignment so that we can state e.g. the catalogue
     * or the roll label which indicates the date of the recording.
     */
    date: DateAssignment 
    created?: Version
}

// F1 Work
export interface Roll {
    catalogueNumber: string     // has identifier
    recordingEvent: RecordingEvent
}

export interface RollTempo {
    startsWith: number;
    endsWith: number;
    unit: string;
}

export type TempoAssignment = EditorialAssumption<'tempoAssignment', RollTempo>

export interface Edition {
    base: string
    creation: EditionCreation
    title: string
    license: string
    roll: Roll
    copies: RollCopy[]
    versions: Version[]
    tempoAdjustment?: TempoAssignment
}

export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'creation' | 'roll'>