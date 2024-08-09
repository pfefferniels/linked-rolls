import { describe, it, expect } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy, asXML, collateRolls } from '../src';
import { v4 } from 'uuid';
import { HandAssignment } from '../src/types';
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

    it('collates it with another copy of the same roll', async () => {
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

        const handAssignment: HandAssignment = {
            type: 'handAssignment',
            hand: {
                carriedOutBy: 'Fritz',
                hasModified: copy1.physicalItem,
                hasTimeSpan: { atSomeTimeWithin: '1909', id: v4() },
                id: v4()
            },
            assignedTo: [copy1.events[0], copy1.events[1], copy1.events[2]],
            carriedOutBy: 'John Doe',
            id: v4(),
        }

        const collatedEvents = collateRolls([copy1, copy2], [])

        const xml = asXML([copy1, copy2], collatedEvents, [handAssignment])
        console.log('xml=', xml, typeof xml)
    })
})
