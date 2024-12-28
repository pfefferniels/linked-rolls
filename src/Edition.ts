import { collateRolls, CollationResult, insertReadings } from "./Collator";
import { Annotation, AnyEditorialAction, EditGroup, TempoAdjustment } from "./EditorialActions";
import { RollCopy } from "./RollCopy";

interface PublicationEvent {
    publisher: string
    publicationDate: string
}

interface RecordingEvent {
    tookPlaceAt: string 
    date: string
}

interface Roll {
    catalogueNumber: string 
    recordingEvent: RecordingEvent
}

export class Edition {
    publicationEvent: PublicationEvent
    title: string 
    license: string
    roll: Roll

    collationResult: CollationResult
    copies: RollCopy[]

    editGroups: EditGroup[]
    annotations: Annotation[]
    tempoAdjustment?: TempoAdjustment

    constructor() {
        this.publicationEvent = {
            publicationDate: Date.now().toString(),
            publisher: 'John Doe'
        }
        this.title = '? (Digital Edition)'
        this.license = 'Creative Commons 3.0'
        this.roll = {
            catalogueNumber: 'WM ...',
            recordingEvent: {
                date: 'Recording date', 
                tookPlaceAt: 'e.g. Leipzig, Freiburg, St. Petersburg, ...'
            }
        }

        this.copies = []

        this.collationResult = {
            events: []
        }
        this.editGroups = []
        this.annotations = []
    }

    collateCopies(assumptionForMismatch: boolean) {
        this.collationResult = collateRolls(
            this.copies
        )

        if (assumptionForMismatch) {
            insertReadings(this.copies, this.collationResult.events, this.editGroups)
        }
    }

    shallowClone(): Edition {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }

    addEditorialAction(action: AnyEditorialAction) {
        this.copies.forEach(copy => {
            copy.applyActions([action])
        })

        if (action.type === 'annotation') {
            this.annotations.push(action)
        }
        else if (action.type === 'editGroup') {
            this.editGroups.push(action)
        }
        else if (action.type === 'tempoAdjustment') {
            this.tempoAdjustment = this.tempoAdjustment
        }
    }

    removeEditorialAction(action: AnyEditorialAction) {
        // TODO
        console.log(action)
    }

    get actions() {
        const result: AnyEditorialAction[] = [
            ...this.editGroups,
            ...this.annotations,
        ]
        if (this.tempoAdjustment) result.push(this.tempoAdjustment)

        return result
    }
}
