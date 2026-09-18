import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Edit } from '../src/Edit'
import { AnySymbol, Note } from '../src/Symbol'
import { CollationTolerance } from '../src/Collation'
import { connectVersions, separateReadings } from '../src/editionOps'
import { idsOf } from '../src/Assumption'
import { mm } from '../src/Quantity'
import { systemOf } from '../src/TrackerBar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { copy, cutFor, editionOf, expression, hole, note, version } from './editionFixture'

/**
 * One text in two copies. The witness puts the third note four
 * millimetres later than the ground copy does, and the other two within
 * a third of a millimetre, so a generous window joins all three and a
 * tight one joins only the first two.
 */
const displacements = [0.2, 0.3, 4]
const at = (i: number) => 100 * i

const twoReadings = (): Edition => editionOf(
    [
        copy('ground', displacements.map((_, i) => hole(`ground-${i}`, at(i), at(i) + 10, 47))),
        copy('witness', displacements.map((d, i) => hole(`witness-${i}`, at(i) + d, at(i) + 10 + d, 47)))
    ],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: displacements.map((_, i) => note(`ground-note-${i}`, 60, `ground-${i}`))
        }]),
        version('B', [{
            type: 'edit',
            id: 'edit-b',
            insert: displacements.map((_, i) => note(`witness-note-${i}`, 60, `witness-${i}`))
        }])
    ]
)

const tight: CollationTolerance = { toleranceStart: mm(1), toleranceEnd: mm(1) }

const viewOf = (edition: Edition) => new EditionView(edition)
const carriersOf = (edition: Edition, symbolId: string) => idsOf(viewOf(edition).get<Note>(symbolId)!.carriers)
const textOf = (edition: Edition, versionId: string) => viewOf(edition).snapshot(versionId).map(s => s.id)
const editsIn = (edition: Edition, versionId: string) => edition.versions.find(v => v.id === versionId)!.edits!

/** The two versions collated at the generous window, every reading folded into the ground copy's symbols. */
const collated = (): Edition => {
    const before = twoReadings()
    return produce(before, connectVersions(viewOf(before), 'B', 'A'))
}

describe('collating a pair that is already collated', () => {
    it('leaves the carriers as they were, rather than handing each symbol its own a second time', () => {
        const once = collated()
        const twice = produce(once, connectVersions(viewOf(once), 'B', 'A'))

        expect(carriersOf(once, 'ground-note-0')).toEqual(['ground-0', 'witness-0'])
        expect(carriersOf(twice, 'ground-note-0')).toEqual(['ground-0', 'witness-0'])
    })

    it('leaves the text of the child as it was', () => {
        const once = collated()
        expect(textOf(produce(once, connectVersions(viewOf(once), 'B', 'A')), 'B')).toEqual(textOf(once, 'B'))
    })
})

describe("taking a copy's reading back out of a collated symbol", () => {
    const separated = (): Edition => {
        const before = collated()
        return produce(before, separateReadings(viewOf(before), 'B', new Set(['witness'])))
    }

    it('leaves the other copies the symbol they had', () => {
        expect(carriersOf(collated(), 'ground-note-0')).toEqual(['ground-0', 'witness-0'])
        expect(carriersOf(separated(), 'ground-note-0')).toEqual(['ground-0'])
    })

    it("gives the copy a symbol of the version's own, carrying what it read", () => {
        const view = viewOf(separated())
        const readings = view.snapshot('B')

        expect(readings.length).toBe(3)
        expect(readings.flatMap(reading => idsOf(reading.carriers)))
            .toEqual(['witness-0', 'witness-1', 'witness-2'])
    })

    it('says what it says, and stands in no relation of the symbol it came out of', () => {
        const reading = viewOf(separated()).snapshot('B')[0] as Note

        expect(reading.type).toBe('note')
        expect(reading.pitch).toBe(60)
        expect(reading.id).not.toBe('ground-note-0')
    })

    it('states the exchange, so the child reads its own copy and the parent the rest', () => {
        const exchanges = editsIn(separated(), 'B')
            .map(edit => [(edit.insert ?? []).length, edit.delete ?? []])

        expect(exchanges.length).toBe(3)
        expect(exchanges.map(([, deleted]) => deleted))
            .toEqual([['ground-note-0'], ['ground-note-1'], ['ground-note-2']])
    })

    it('passes over a symbol the copy alone carries, so a reading separated by hand keeps its identifier', () => {
        const before = separated()
        const again = produce(before, separateReadings(viewOf(before), 'B', new Set(['witness'])))

        expect(again).toBe(before)
    })

    it('narrows the act to the symbols named', () => {
        const before = collated()
        const one = produce(before, separateReadings(viewOf(before), 'B', new Set(['witness']), ['ground-note-2']))

        expect(carriersOf(one, 'ground-note-2')).toEqual(['ground-2'])
        expect(carriersOf(one, 'ground-note-0')).toEqual(['ground-0', 'witness-0'])
    })
})

/**
 * A side of several copies, as a real stemma has once a collation has
 * handed a descendant's carriers up. `later` reads with `witness`
 * against `ground`, so the two of them are one side and `ground` the
 * other, and separating only one of them would leave the rest of its
 * own side behind to be compared against.
 */
const threeCopies = (): Edition => editionOf(
    [
        copy('ground', [hole('ground-0', 0, 10, 47), hole('ground-1', 100, 110, 47)]),
        copy('witness', [hole('witness-0', 0.2, 10.2, 47), hole('witness-1', 100.2, 110.2, 47)]),
        copy('later', [hole('later-0', 0.3, 10.3, 47), hole('later-1', 100.3, 110.3, 47)])
    ],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                note('shared-0', 60, 'ground-0', 'witness-0', 'later-0'),
                note('shared-1', 60, 'ground-1', 'witness-1', 'later-1')
            ]
        }]),
        version('B', [], 'A')
    ]
)

describe('separating a side that several copies attest', () => {
    const wholeSide = (): Edition => {
        const before = threeCopies()
        return produce(before, separateReadings(viewOf(before), 'B', new Set(['witness', 'later'])))
    }

    const oneOfIt = (): Edition => {
        const before = threeCopies()
        return produce(before, separateReadings(viewOf(before), 'B', new Set(['witness'])))
    }

    it('leaves the other side alone with what it read', () => {
        expect(carriersOf(wholeSide(), 'shared-0')).toEqual(['ground-0'])
    })

    it('gives the side one symbol carrying all of it, not one symbol each', () => {
        const readings = viewOf(wholeSide()).snapshot('B')

        expect(readings.length).toBe(2)
        expect(idsOf(readings[0].carriers)).toEqual(['witness-0', 'later-0'])
    })

    /**
     * Naming one copy of a side leaves the rest of that side on the
     * other one's symbol, so what a collation would then compare is one
     * copy against a mixture of both sides.
     */
    it('leaves the rest of the side behind when only one of its copies is named', () => {
        expect(carriersOf(oneOfIt(), 'shared-0')).toEqual(['ground-0', 'later-0'])
    })

    it('passes over a symbol the named side alone carries, there being no other side to part from', () => {
        const before = wholeSide()
        expect(produce(before, separateReadings(viewOf(before), 'B', new Set(['witness', 'later'])))).toBe(before)
    })
})

/**
 * An ancestor, a version separating a side of it, and a descendant that
 * had struck one of the ancestor's symbols from its own text.
 */
const withADescendant = (): Edition => editionOf(
    [
        copy('ground', [hole('ground-0', 0, 10, 47), hole('ground-1', 100, 110, 47)]),
        copy('witness', [hole('witness-0', 0.2, 10.2, 47), hole('witness-1', 100.2, 110.2, 47)])
    ],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                note('shared-0', 60, 'ground-0', 'witness-0'),
                note('shared-1', 60, 'ground-1', 'witness-1')
            ]
        }]),
        version('B', [], 'A'),
        version('C', [{ type: 'edit', id: 'edit-c', delete: ['shared-0'] }], 'B')
    ]
)

describe('separating under a version whose descendants struck what it shares', () => {
    /**
     * A known defect, recorded as one rather than fixed, because the
     * fix does not belong in either operation alone.
     *
     * Separating exchanges an inherited symbol for one standing in its
     * place, and a descendant that had struck the old identifier is
     * left striking nothing, so the reading it rejected returns to its
     * text. Re-collating repairs that wherever it joins the two
     * readings again, which is most of them, and leaves it standing for
     * the readings the new window parts.
     *
     * Rewriting the deletions when separating is not the answer: they
     * would then name symbols the re-collation discards, which is worse
     * by two orders of magnitude on a real stemma. Settling them needs
     * the outcome of the collation, which neither operation can see
     * alone.
     */
    it.fails('leaves the descendant reading what it read before', () => {
        const before = withADescendant()
        const after = produce(before, separateReadings(viewOf(before), 'B', new Set(['witness'])))

        expect(textOf(before, 'C')).toEqual(['shared-1'])
        expect(textOf(after, 'C').length).toBe(1)
    })
})

describe('collating a derivation again at a tolerance arrived at afterwards', () => {
    const recollated = (): Edition => {
        const separated = produce(collated(), separateReadings(viewOf(collated()), 'B', new Set(['witness'])))
        return produce(separated, connectVersions(viewOf(separated), 'B', 'A', tight))
    }

    it('joins again what the tighter window still admits', () => {
        expect(carriersOf(recollated(), 'ground-note-0')).toEqual(['ground-0', 'witness-0'])
        expect(carriersOf(recollated(), 'ground-note-1')).toEqual(['ground-1', 'witness-1'])
    })

    it('leaves apart the reading the window no longer admits', () => {
        expect(carriersOf(recollated(), 'ground-note-2')).toEqual(['ground-2'])
    })

    it('states it as an insertion and a deletion, which is what a collation writes for a pair it cannot join', () => {
        const edits = editsIn(recollated(), 'B')
        const inserted = edits.flatMap(edit => edit.insert ?? [])

        expect(edits.flatMap(edit => edit.delete ?? [])).toEqual(['ground-note-2'])
        expect(inserted.length).toBe(1)
        expect(idsOf(inserted[0].carriers)).toEqual(['witness-2'])
    })

    it('leaves the child a text of the same size, one reading per symbol', () => {
        expect(textOf(recollated(), 'B').length).toBe(3)
    })

    it('states the tolerance it was collated at on the derivation', () => {
        expect(recollated().versions[1].basedOn![0].collationTolerance).toEqual(tight)
    })
})

/** One roll issued for two systems, the green copy spelling a crescendo as one held command. */
const twoIssues = (): Edition => editionOf(
    [
        copy('red', [
            hole('hole-note', 1000, 1010, 47),
            hole('hole-cresc-on', 900, 902, 4),
            hole('hole-cresc-off', 1100, 1102, 3)
        ]),
        cutFor(copy('green', [
            hole('hole-note-green', 1000, 1010, 45),
            hole('hole-cresc', 900, 1100, 4)
        ]), systemOf(welteT98))
    ],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                note('note', 60, 'hole-note'),
                expression('cresc-on', 'SlowCrescendoOn', 'hole-cresc-on'),
                expression('cresc-off', 'SlowCrescendoOff', 'hole-cresc-off')
            ]
        }]),
        {
            ...version('B', [{
                type: 'edit',
                id: 'edit-b',
                insert: [
                    note('note-green', 60, 'hole-note-green'),
                    expression('cresc-green', 'Crescendo', 'hole-cresc')
                ]
            }]),
            system: systemOf(welteT98)
        }
    ]
)

const equivalenceIn = (edition: Edition): Edit =>
    editsIn(edition, 'B').find(edit => edit.editType === 'replace-with-equivalent')!

describe('an equivalence an editor has written on', () => {
    /** The transfer collated once, with a motivation added to the equivalence afterwards, as an editor would. */
    const explained = (): Edition => {
        const before = twoIssues()
        const attached = produce(before, connectVersions(viewOf(before), 'B', 'A'))
        return produce(attached, draft => {
            const edit = draft.versions[1].edits!.find(e => e.editType === 'replace-with-equivalent')!
            edit.motivation = 'the green scale holds what the red latches'
        })
    }

    it('keeps its identifier and its motivation where the collation draws it again over the same symbols', () => {
        const before = explained()
        const again = produce(before, connectVersions(viewOf(before), 'B', 'A'))

        expect(equivalenceIn(again).id).toBe(equivalenceIn(before).id)
        expect(equivalenceIn(again).motivation).toBe('the green scale holds what the red latches')
    })

    it('does not freeze the symbols it speaks for, so the transfer can be collated again at all', () => {
        const before = explained()
        const again = produce(before, connectVersions(viewOf(before), 'B', 'A'))
        const symbols = (edition: Edition): string[] =>
            (equivalenceIn(edition).insert ?? []).map((s: AnySymbol) => s.id)

        expect(symbols(again)).toEqual(symbols(before))
        expect(equivalenceIn(again).delete).toEqual(['cresc-on', 'cresc-off'])
    })
})
