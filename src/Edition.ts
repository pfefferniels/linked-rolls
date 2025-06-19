import { EditorialAssumption, Question } from "./EditorialAssumption";
import { WithId } from "./WithId";
import { DateAssignment, RollCopy } from "./RollCopy";
import { Stage } from "./Stage";
import { Collation } from "./Collation";

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

export interface EditionCreation {
    publisher: Person
    publicationDate: Date
    consistsOf: Collation
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
    created?: Stage
}

// F21 Recording Work
export interface Roll {
    catalogueNumber: string     // has inventory-no (of a certain type)
    recordingEvent: RecordingEvent
}

export interface RollTempo {
    startsWith: number;
    endsWith: number;
    unit: string;
}

export interface TempoAssignment extends EditorialAssumption<'tempoAssignment', RollTempo> { }

export interface Edition {
    base: string
    publicationEvent: EditionCreation
    title: string
    license: string
    roll: Roll
    copies: RollCopy[]
    stages: Stage[]
    questions: Question[]
    tempoAdjustment?: TempoAssignment
}

export type EditionMetadata = Pick<Edition, 'base' | 'title' | 'license' | 'publicationEvent' | 'roll'>