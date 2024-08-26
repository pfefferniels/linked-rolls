import { collateRolls, CollationResult, insertReadings } from "./Collator";
import { Annotation, AnyEditorialAction, Relation, TempoAdjustment } from "./EditorialActions";
import { RollCopy } from "./RollCopy";

export class Edition {
    collationResult: CollationResult
    copies: RollCopy[]
    editors: string[]

    relations: Relation[]
    annotations: Annotation[]
    tempoAdjustment?: TempoAdjustment

    constructor() {
        this.collationResult = {
            events: []
        }
        this.copies = []
        this.relations = []
        this.annotations = []
        this.tempoAdjustment
        this.editors = []
    }

    addEditor(name: string) {
        this.editors.push(name)
    }

    collateCopies(assumptionForMismatch: boolean) {
        this.collationResult = collateRolls(
            this.copies
        )

        if (assumptionForMismatch) {
            insertReadings(this.copies, this.collationResult.events, this.relations)
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
        else if (action.type === 'relation') {
            this.relations.push(action)
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
            ...this.relations,
            ...this.annotations,
        ]
        if (this.tempoAdjustment) result.push(this.tempoAdjustment)

        return result
    }
}
