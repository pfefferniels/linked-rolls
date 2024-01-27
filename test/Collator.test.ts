import { describe, it } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from '../src/RollCopy';
import { Collator } from '../src/Collator';
const path = require("path");

const fileToRollCopy = (filename: string) => {
    const file = readFileSync(path.resolve(__dirname, filename));
    const contents = file.toString()
    const lr = new RollCopy()
    lr.readFromStanfordAton(contents)
    return lr
}

describe('Collator', () => {
    const copy1 = fileToRollCopy("./fixtures/traeumerei1_analysis.txt")
    const copy2 = fileToRollCopy("./fixtures/traeumerei2_analysis.txt")

    const collator = new Collator()

    it('imports a roll copy', async () => {
        collator.prepareFromRollCopy(copy1)
    })

    it('collates it with another copy of the same roll', async () => {
        await collator.collateWith(copy2)
        console.log(collator.events.map(event => {
            if (event.wasCollatedFrom && event.wasCollatedFrom.length) {
                return event.wasCollatedFrom.map(event => event.L43Annotates?.['@id'])
            }
            else return []
        }))
    })
})
