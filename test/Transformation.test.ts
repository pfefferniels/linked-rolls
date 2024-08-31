import { describe, it, expect } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy, asXML, collateRolls } from '../src';
import { v4 } from 'uuid';
import { HandAssignment, Relation, Separation, Unification } from '../src/types';
const path = require("path");

const fileToRollCopy = (filename: string) => {
    const file = readFileSync(path.resolve(__dirname, filename));
    const contents = file.toString()
    const lr = new RollCopy()
    lr.readFromStanfordAton(contents)
    return lr
}

describe('Transformations', () => {
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

    it('Wraps separations in <choice>', () => {
        const re = copy1.events[2]

        const separation: Separation = {
            type: 'separation',
            separated: re,
            into: [
                {
                    id: 'new-expr1',
                    type: 'expression',
                    P2HasType: 'ForzandoOff',
                    hasScope: 'bass',
                    hasDimension: {
                        id: v4(),
                        horizontal: {
                            from: 22,
                            to: 23,
                            hasUnit: 'mm'
                        },
                        vertical: {
                            from: 5,
                            hasUnit: 'track'
                        }
                    }
                },
                {
                    id: 'new-expr2',
                    type: 'expression',
                    P2HasType: 'ForzandoOff',
                    hasScope: 'bass',
                    hasDimension: {
                        id: v4(),
                        horizontal: {
                            from: 24,
                            to: 25,
                            hasUnit: 'mm'
                        },
                        vertical: {
                            from: 5,
                            hasUnit: 'track'
                        }
                    }
                },
            ],
            carriedOutBy: 'John Doe',
            id: 'my-separation'
        }

        const collatedEvents = collateRolls([copy1], [separation])
        const xml = asXML([copy1], collatedEvents, [separation]) as string

        expect(Array.from(xml.matchAll(/<choice/g)).length).toBe(1)
        expect(Array.from(xml.matchAll(/<sic/g)).length).toBe(1)
        expect(Array.from(xml.matchAll(/<corr/g)).length).toBe(1)
    })

    it('Wraps unification in <choice>', () => {
        const re1 = copy1.events[2]
        const re2 = copy1.events[3]

        const unification: Unification = {
            type: 'unification',
            unified: [re1, re2],
            carriedOutBy: 'John Doe',
            id: 'my-unification'
        }

        const collatedEvents = collateRolls([copy1], [unification])
        const xml = asXML([copy1], collatedEvents, [unification]) as string

        expect(Array.from(xml.matchAll(/<choice/g)).length).toBe(1)
        expect(Array.from(xml.matchAll(/<sic/g)).length).toBe(1)
        expect(Array.from(xml.matchAll(/<corr/g)).length).toBe(1)
    })

})


