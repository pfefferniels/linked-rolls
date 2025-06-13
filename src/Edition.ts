import { Question, TempoAssignment } from "./EditorialAssumption";
import { WithId } from "./WithId";
import { RollCopy } from "./RollCopy";
import { Stage } from "./Stage";
import { Collation } from "./Collation";

// E21 Person
export interface Person extends Partial<WithId> {
    name: string // rdfs:label
    sameAs: string[] // owl:sameAs - might link to GND, Wikidata, etc.
    role?: string // e.g. 'pianist', 'editor', 'publisher', etc.
}

export interface EditionCreation {
    publisher: Person
    publicationDate: string
    consistsOf: Collation
}

export interface RecordingEvent {
    recorded: { // R20 recorded => F31 Performance
        pianist: Person;
        playing: string;    // should point to GND
    }
    tookPlaceAt: string // should point to geoplaces
    date: string
    created?: Stage
}

// F21 Recording Work
export interface Roll {
    catalogueNumber: string     // has inventory-no (of a certain type)
    recordingEvent: RecordingEvent
}

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
