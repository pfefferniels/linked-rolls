import { Edit, ObjectUsage, Stage } from "./EditorialActions";

/**
 * Stage Assumption = F28 Expression Creation
 */
export class StageCreation {
    created: Stage; // R17 created
    basedOn: ObjectUsage; // P140i was attributed by
    edits: Edit[]; // P9 consists of

    constructor(stage: Stage, basedOn: ObjectUsage) {
        this.created = stage
        this.basedOn = basedOn
        this.edits = []
    }

    get actions() {
        return [...this.edits, this.basedOn]
    }
}

