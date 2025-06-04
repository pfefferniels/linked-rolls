import { collateRolls, Collation } from "./Collation";
import { AnyEditorialAssumption, Question, TempoAdjustment } from "./EditorialAssumption";
import { WithId } from "./WithId";
import { RollCopy } from "./RollCopy";
import { StageCreation } from "./Stage";
import { v4 } from "uuid";

export interface PreliminaryRoll extends WithId {}

// E21 Person
export interface Person extends Partial<WithId> {
    name: string // rdfs:label
    sameAs: string[] // owl:sameAs - might link to GND, Wikidata, etc.
    role?: string // e.g. 'pianist', 'editor', 'publisher', etc.
}

export interface PublicationEvent {
    publisher: Person
    publicationDate: string
}

export interface RecordingEvent {
    recorded: { // R20 recorded => F31 Performance
        pianist: Person;
        playing: string;    // should point to GND
    }
    tookPlaceAt: string // should point to geoplaces
    date: string
    created?: PreliminaryRoll
}

// F21 Recording Work
export interface Roll {
    catalogueNumber: string     // has inventory-no (of a certain type)
    recordingEvent: RecordingEvent
}

export class Edition {
    base: string = 'https://example.org/'
    publicationEvent: PublicationEvent
    title: string
    license: string
    roll: Roll

    collation: Collation
    copies: RollCopy[]

    stages: StageCreation[]
    questions: Question[]
    tempoAdjustment?: TempoAdjustment

    constructor() {
        this.publicationEvent = {
            publicationDate: Date.now().toString(),
            publisher: {
                id: v4(),
                name: 'John Doe',
                sameAs: []
            }
        }
        this.title = '? (Digital Edition)'
        this.license = 'Creative Commons 3.0'
        this.roll = {
            catalogueNumber: 'WM ...',
            recordingEvent: {
                recorded: {
                    pianist: {
                        name: 'e.g. Alfred Grünfeld',
                        sameAs: []
                    },
                    playing: 'e.g. Schumann, Träumerei'
                },
                date: 'Recording date',
                tookPlaceAt: 'e.g. Leipzig, Freiburg, St. Petersburg, ...'
            }
        }

        this.copies = []

        this.collation = {
            measured: [],
            tolerance: 5,
            events: []
        }
        this.stages = []
        this.questions = []
    }

    collateCopies() {
        this.collation = collateRolls(
            this.copies
        )
    }

    shallowClone(): Edition {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    addEditorialAction(action: AnyEditorialAssumption) {
        this.copies.forEach(copy => {
            copy.applyActions([action])
        })

        if (action.type === 'question') {
            this.questions.push(action)
        }
        else if (action.type === 'tempoAdjustment') {
            this.tempoAdjustment = this.tempoAdjustment
        }
    }

    removeEditorialAction(action: AnyEditorialAssumption) {
        if (action.type === 'question') {
            this.questions = this.questions.filter(q => q.id !== action.id)
        }
        else if (action.type === 'tempoAdjustment') {
            this.tempoAdjustment = undefined
        }

        this.stages.forEach(stage => {
            stage.removeEditorialAction(action);
        })

        // TODO
        // this.copies.forEach(copy => {
        //     copy.removeActions(action)
        // })
    }

    get actions() {
        const result: AnyEditorialAssumption[] = [
            ...this.questions,
            ...this.stages.map(stage => stage.actions).flat()
        ]
        if (this.tempoAdjustment) result.push(this.tempoAdjustment)

        return result
    }
}
