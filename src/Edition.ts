import { collateRolls, CollationResult, insertReadings } from "./Collator";
import { RollCopy } from "./RollCopy";
import { Assumption } from "./types";

export class Edition {
    collationResult: CollationResult
    copies: RollCopy[]
    assumptions: Assumption[]
    editors: string[]

    constructor() {
        this.collationResult = {
            events: []
        }
        this.copies = []
        this.assumptions = []
        this.editors = []
    }

    addEditor(name: string) {
        this.editors.push(name)
    }

    collateCopies(assumptionForMismatch: boolean) {
        this.collationResult = collateRolls(
            this.copies,
            this.assumptions
        )

        if (assumptionForMismatch) {
            insertReadings(this.copies, this.collationResult.events, this.assumptions)
        }
    }

    shallowClone() {
        const clone = new Edition()
        clone.collationResult = this.collationResult
        clone.copies = this.copies
        clone.assumptions = this.assumptions
        clone.editors = this.editors
        return clone
    }
}
