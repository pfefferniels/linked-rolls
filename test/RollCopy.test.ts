import { describe, expect, test } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from '../src/RollCopy';
import { v4 } from 'uuid';
const path = require("path");

describe('LinkedRoll class', () => {
    const file = readFileSync(path.resolve(__dirname, "./fixtures/faust.txt"));
    const contents = file.toString()
    const rollCopy = new RollCopy()
    rollCopy.readFromStanfordAton(contents)

    test('imports ATON files correctly', async () => {
        expect(rollCopy.events.length).toEqual(2406)
    })

    test('assess conditions', async () => {
        rollCopy.assessCondition({
            id: v4(),
            hasNote: 'exposure to high humidity changed to paper',
            hasTimeSpan: { id: v4(), atSomeTimeWithin: '1970-now' },
        }, 'https://orcid.org/me')

        expect(rollCopy.conditionAssessments.length).toEqual(1)
    })

    test ('applies operations', async () => {
        rollCopy.applyOperations([
            {
                type: 'shifting',
                id: v4(),
                vertical: 0,
                horizontal: 50
            },
            {
                type: 'stretching',
                id: v4(),
                factor: 1.2
            }
        ])

        expect(rollCopy.operations.length).toEqual(2)
    })
})
