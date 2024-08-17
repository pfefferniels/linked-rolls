import { describe, it, expect } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy, asXML, collateRolls } from '../src';
import { v4 } from 'uuid';
import { HandAssignment, Relation } from '../src/types';
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

    it('applies hand assignment', async () => {
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

        const xml = asXML([copy1, copy2], collatedEvents, [handAssignment]) as string
        expect(Array.from(xml.matchAll(/hand=/g)).length).toBe(1)
    })

    it('applies hand assignment with subsequential reading group', async () => {
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

        const noteC = copy1.events.find(e => e.type === 'note' && e.hasPitch === 60)
        const noteF = copy1.events.find(e => e.type === 'note' && e.hasPitch === 65)

        if (!noteC || !noteF) return

        const handAssignment: HandAssignment = {
            type: 'handAssignment',
            hand: {
                carriedOutBy: 'Fritz',
                hasModified: copy1.physicalItem,
                hasTimeSpan: { atSomeTimeWithin: '1909', id: v4() },
                id: 'fritz'
            },
            assignedTo: [noteC, noteF],
            carriedOutBy: 'John Doe',
            id: 'distinct-reading',
        }

        const collatedEvents = collateRolls([copy1, copy2], [])

        const collatedNoteC = collatedEvents.find(e => {
            const origEvent = e.wasCollatedFrom[0]
            if (!origEvent) return

            return origEvent.id == noteC.id
        })

        const collatedNoteF = collatedEvents.find(e => {
            const origEvent = e.wasCollatedFrom[0]
            if (!origEvent) return

            return origEvent.id === noteF.id
        })

        if (!collatedNoteC || !collatedNoteF) {
            console.log('something went wrong')
            return
        }

        const rel: Relation = {
            type: 'relation',
            id: v4(),
            carriedOutBy: 'John Doe',
            relates: [{
                id: v4(),
                contains: [collatedNoteC, collatedNoteF]
            }]
        }

        const xml = asXML([copy1, copy2], collatedEvents, [handAssignment, rel]) as string
        expect(Array.from(xml.matchAll(/hand\=\"fritz"/g)).length).toBe(1)
        expect(Array.from(xml.matchAll(/xml\:id\=\"distinct\-reading\"/g)).length).toBe(1)
    })
})
