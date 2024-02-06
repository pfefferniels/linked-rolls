import { describe, it } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from '../src/RollCopy';
import { Collator } from '../src/Collator';
const path = require("path");

const fileToRollCopy = (filename: string) => {
    const file = readFileSync(path.resolve(__dirname, filename));
    const contents = file.toString()
    const lr = new RollCopy(filename)
    lr.readFromStanfordAton(contents)
    return lr
}

describe('Collator', () => {
    const copy1 = fileToRollCopy("./fixtures/traeumerei1_analysis.txt")
    const copy2 = fileToRollCopy("./fixtures/traeumerei2_analysis.txt")

    const collator = new Collator()

    it('imports a roll copy', async () => {
        collator.addRoll(copy2)
        collator.addRoll(copy1)
    })

    it('collates it with another copy of the same roll', async () => {
        collator.shiftRollCopy(copy1, 91.514, -1)
        collator.stretchRollCopy(copy1, 1.00233)
        collator.applyOperations()

        collator.rolls[0].events = collator.rolls[0].events.slice(0, 10)
        collator.rolls[1].events = collator.rolls[1].events.slice(0, 18)

        collator.prepareFromRollCopy(collator.rolls[0])

        console.log(collator.events.length)

        // console.log(collator.rolls[0].events.map(e => e.P43HasDimension.from))
        // console.log(collator.rolls[1].events.map(e => e.P43HasDimension.from))

        await collator.collateAllRolls()
        console.log(collator.events.map(event => {
            if (event.wasCollatedFrom && event.wasCollatedFrom.length) {
                return event.wasCollatedFrom.map(event => event.L43Annotates?.['@id'])
            }
            else return []
        }))
    })

    it('imports an existing collation', () => {
        const file = readFileSync(path.resolve(__dirname, './fixtures/collated-roll.ttl'));
        const contents = file.toString()

        const collator = new Collator()
        collator.importFromTurtle(contents)
    })
})
