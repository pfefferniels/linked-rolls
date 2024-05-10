import { describe, it, expect } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy, asXML, collateRolls } from '../src';
import { v4 } from 'uuid';
const path = require("path");

const fileToRollCopy = (filename: string) => {
    const file = readFileSync(path.resolve(__dirname, filename));
    const contents = file.toString()
    const lr = new RollCopy()
    lr.readFromStanfordAton(contents)
    return lr
}

describe('asXML', () => {
    const copy1 = fileToRollCopy("./fixtures/traeumerei1_analysis.txt")
    const copy2 = fileToRollCopy("./fixtures/traeumerei2_analysis.txt")

    it('exports xml', async () => {
        copy1.applyOperations([
            {
                type: 'shifting',
                vertical: -1,
                horizontal: 91.514,
                id: v4()
            },
            {
                type: 'stretching',
                factor: 1.00233,
                id: v4()
            }])

        const collatedEvents = collateRolls([copy1, copy2])
        expect(collatedEvents.length).toBeGreaterThan(1)

        const xml = asXML([copy1, copy2], collatedEvents, [])
        console.log(new XMLSerializer().serializeToString(xml))
    })
})
