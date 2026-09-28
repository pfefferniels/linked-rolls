import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/io/importJsonLd'
import { produce } from 'immer'
import { symbolIn, versionIn } from '../src/lookup/lookup'
import { getAt, pathOf } from '../src/lookup/paths'
import { placedCarriersOf, placeOf, snapshotOf } from '../src/analysis/text'
import { Edition } from '../src/model/Edition'
import { FeatureOrPatch } from '../src/model/Feature'
import { Emulation } from '../src/emulation/Emulation'
import { assignReference } from '../src/model/Assumption'
import { Expression, Note } from '../src/model/Symbol'
import { constraintProblems } from '../src/analysis/constraints'
import { flat } from './flat'
import { mean, mm } from '../src/model/Quantity'
import { punchDiameterOf } from '../src/model/RollCopy'
import { copy, editionOf, expression, hole, note, version } from './editionFixture'
import { Version } from '../src/model/Version'
import { systemOf } from '../src/systems/TrackerBar'
import { welteT98 } from '../src/systems/welteT98/bar'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')

/**
 * A fresh edition for every test, with the first version's placed
 * commands at hand: three expressions and a note, in order of place.
 * What a test states of them is written as an operation would write it,
 * so that everything read afterwards reads the edition as it then stands.
 */
const setUp = () => {
    let edition = importJsonLd(JSON.parse(file))
    const version = edition.versions[0]
    const placed = snapshotOf(edition, version.id).filter(s => placeOf(edition, s) !== undefined)
    const [first, second, third] = placed.filter((s): s is Expression => s.type === 'expression')
    const note = placed.find((s): s is Note => s.type === 'note')!
    const placeNow = (symbol: Note | Expression) => placeOf(edition, symbolIn(edition, symbol.id)!)!
    const onsetOf = (symbol: Note | Expression) => placeNow(symbol).from
    const lengthOf = (symbol: Note | Expression) => {
        const { from, to } = placeNow(symbol)
        return to - from
    }
    const emulate = () => {
        const emulation = new Emulation(flat)
        emulation.emulateVersion(versionIn(edition, version.id)!, edition)
        const placedAs = (symbol: Note | Expression) => emulation.negotiatedEvents.find(e => e.id === symbol.id)!.horizontal
        return placedAs
    }

    /** States something of the command, in the edition as it now stands. */
    const stating = (symbol: Note | Expression, statement: (command: Note | Expression) => void) => {
        const path = pathOf(edition, symbol.id)!
        edition = produce(edition, draft => statement(getAt<Note | Expression>(path, draft)!))
    }

    const copyOf = (featureId: string) => pathOf(edition, featureId)?.[1]
    const onsetOn = (symbol: Note | Expression, copy: number | string | undefined) => {
        const carrier = placedCarriersOf(edition, symbol).find(c => copyOf(c.id) === copy)
        if (!carrier) throw new Error(`${symbol.id} has no carrier on copy ${copy}`)
        return carrier.horizontal.from
    }
    /**
     * Moves every hole carrying a symbol so that on each copy it starts
     * the given distance, by the copy's index, from the reference's
     * onset there, keeping each hole's length.
     */
    const placeBeside = (symbol: Note | Expression, reference: Note | Expression, distances: readonly number[]) => {
        const moves = placedCarriersOf(edition, symbol).map(({ id, horizontal }) => {
            const copy = copyOf(id)
            const distance = typeof copy === 'number' ? distances[copy] : undefined
            if (distance === undefined) throw new Error(`no distance for copy ${copy}`)
            const length = horizontal.to - horizontal.from
            const from = mm(onsetOn(reference, copy) + distance)
            return { path: pathOf(edition, id)!, from, to: mm(from + length) }
        })
        edition = produce(edition, draft => moves.forEach(({ path, from, to }) => {
            const { horizontal } = getAt<FeatureOrPatch>(path, draft)!
            horizontal.from = from
            horizontal.to = to
        }))
    }

    const punchDiameters = edition.copies
        .map(punchDiameterOf)
        .filter(value => value !== undefined)
    /** What the performance falls back on where no copy agrees with a statement. */
    const gap = mean(punchDiameters)

    return { current: () => edition, version, first, second, third, note, onsetOf, lengthOf, stating, placeBeside, gap, emulate }
}

describe('aligning a command with another', () => {
    it('takes the onset of the reference and keeps its length', () => {
        const { first, note, onsetOf, lengthOf, emulate, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference(note.id) })

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(note))
        expect(placedAs(first).to - placedAs(first).from).toBeCloseTo(lengthOf(first))
        expect(placedAs(note).from).toEqual(onsetOf(note))
    })

    it('follows a chain of references to its end', () => {
        const { first, second, note, onsetOf, emulate, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference(second.id) })
        stating(second, command => { command.alignedWith = assignReference(note.id) })

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(note))
        expect(placedAs(second).from).toEqual(onsetOf(note))
    })

    it('leaves a command whose reference is absent where it is', () => {
        const { first, onsetOf, emulate, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference('nowhere') })

        expect(emulate()(first).from).toEqual(onsetOf(first))
    })
})

describe('placing a command before or after another', () => {
    it('leaves it where the measurement already has it on that side', () => {
        const { first, note, onsetOf, placeBeside, emulate, stating } = setUp()
        placeBeside(first, note, [-5, -3, -4])
        stating(first, command => { command.before = assignReference(note.id) })

        expect(emulate()(first).from).toEqual(onsetOf(first))
    })

    it('puts it on that side as far as the copies that agree put it', () => {
        const { first, note, onsetOf, placeBeside, emulate, stating } = setUp()
        placeBeside(first, note, [-2, 6, 8])
        stating(first, command => { command.before = assignReference(note.id) })

        expect(onsetOf(first)).toBeGreaterThan(onsetOf(note))
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) - 2)
    })

    it('does the same after', () => {
        const { first, note, onsetOf, placeBeside, emulate, stating } = setUp()
        placeBeside(first, note, [2, -6, -8])
        stating(first, command => { command.after = assignReference(note.id) })

        expect(onsetOf(first)).toBeLessThan(onsetOf(note))
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) + 2)
    })

    it('puts it a punch diameter away where no copy agrees', () => {
        const { first, note, onsetOf, placeBeside, gap, emulate, stating } = setUp()
        placeBeside(first, note, [3, 6, 4])
        stating(first, command => { command.before = assignReference(note.id) })

        expect(gap).toBeGreaterThan(0)
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) - gap)
    })

    it('judges the side against where the reference comes to lie', () => {
        const { first, second, note, onsetOf, placeBeside, gap, emulate, stating } = setUp()
        stating(second, command => { command.alignedWith = assignReference(note.id) })
        placeBeside(first, note, [4, 4, 4])
        stating(first, command => { command.before = assignReference(second.id) })

        const placedAs = emulate()
        expect(placedAs(second).from).toEqual(onsetOf(note))
        expect(placedAs(first).from).toBeCloseTo(onsetOf(note) - gap)
    })
})

describe('pairing two commands', () => {
    it('moves the partner by the same distance', () => {
        const { first, second, note, onsetOf, emulate, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference(note.id) })
        stating(second, command => { command.pairedWith = assignReference(first.id) })

        const placedAs = emulate()
        const displacement = placedAs(first).from - onsetOf(first)
        expect(displacement).not.toEqual(0)
        expect(placedAs(second).from - onsetOf(second)).toEqual(displacement)
        expect(placedAs(second).from - placedAs(first).from).toBeCloseTo(onsetOf(second) - onsetOf(first))
    })

    it('holds in both directions', () => {
        const { first, second, note, onsetOf, emulate, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference(note.id) })
        stating(first, command => { command.pairedWith = assignReference(second.id) })

        const placedAs = emulate()
        expect(placedAs(second).from - onsetOf(second)).toEqual(placedAs(first).from - onsetOf(first))
    })

    it('leaves a pair alone when neither member is aligned', () => {
        const { first, second, onsetOf, emulate, stating } = setUp()
        stating(first, command => { command.pairedWith = assignReference(second.id) })

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(first))
        expect(placedAs(second).from).toEqual(onsetOf(second))
    })
})

describe('reporting constraints that cannot hold', () => {
    const problemsWith = (edition: Edition, versionId: string, symbolId: string) =>
        constraintProblems(edition)
            .filter(problem => problem.version === versionId && problem.symbol === symbolId)
            .map(problem => problem.problem)

    it('finds no placement or pairing to report in the edition as it is', () => {
        const { current } = setUp()
        const known = new Set(['carrier-on-another-track', 'strike-bites-nothing'])
        const stated = constraintProblems(current()).filter(problem => !known.has(problem.problem))
        expect(stated).toEqual([])
    })

    /**
     * A second real fault in the 0.1 fixture: eleven of one version's
     * nineteen strikes name symbols that stand nowhere in the edition,
     * so they take nothing out of its text.
     *
     * The check also catches the subtler shape, where the symbol does
     * exist but has passed out of the version's inherited text, as
     * happens when a symbol two versions shared is parted in two. That
     * one leaves nothing dangling and shows only as a handful of
     * readings quietly returning.
     */
    it('reports a strike that takes nothing out of the text', () => {
        const { current } = setUp()
        const reported = constraintProblems(current())
            .filter(problem => problem.problem === 'strike-bites-nothing')

        expect(reported.length).toBe(11)
        expect(new Set(reported.map(problem => problem.version)).size).toBe(1)
        reported.forEach(({ symbol }) => expect(symbolIn(current(), symbol)).toBeUndefined())
    })

    /**
     * A real fault in the 0.1 fixture rather than a contrived one: four
     * of its symbols name carriers that say something else, a treble
     * SustainPedalOff on track 94 also claiming note holes on 59 and a
     * crescendo hole on 4. Nothing checked the tracks of a carrier
     * before, so it went unnoticed.
     */
    it('reports a carrier sitting on a track that does not say what its symbol says', () => {
        const { current } = setUp()
        const reported = constraintProblems(current())
            .filter(problem => problem.problem === 'carrier-on-another-track')

        expect(new Set(reported.map(problem => problem.symbol)).size).toBe(4)
        reported.forEach(({ symbol }) => {
            const carried = symbolIn(current(), symbol)!
            const tracks = placedCarriersOf(current(), carried).map(carrier => carrier.vertical.from)
            expect(new Set(tracks).size).toBeGreaterThan(1)
        })
    })

    it('says nothing of carriers that agree across two systems', () => {
        const { current, note } = setUp()
        expect(problemsWith(current(), current().versions[0].id, note.id)).toEqual([])
    })

    it('reports a missing reference and a missing partner', () => {
        const { current, version, first, second, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference('nowhere') })
        stating(second, command => { command.pairedWith = assignReference('nowhere') })

        expect(problemsWith(current(), version.id, first.id)).toEqual(['alignment-reference-missing'])
        expect(problemsWith(current(), version.id, second.id)).toEqual(['partner-missing'])
    })

    it('reports a missing reference of an order as well', () => {
        const { current, version, first, second, stating } = setUp()
        stating(first, command => { command.before = assignReference('nowhere') })
        stating(second, command => { command.after = assignReference('nowhere') })

        expect(problemsWith(current(), version.id, first.id)).toEqual(['before-reference-missing'])
        expect(problemsWith(current(), version.id, second.id)).toEqual(['after-reference-missing'])
    })

    it('reports a command placed relative to itself or in several ways', () => {
        const { current, version, first, second, note, stating } = setUp()
        stating(first, command => { command.before = assignReference(first.id) })
        stating(second, command => { command.alignedWith = assignReference(note.id) })
        stating(second, command => { command.after = assignReference(note.id) })

        expect(problemsWith(current(), version.id, first.id)).toEqual(['placed-relative-to-itself'])
        expect(problemsWith(current(), version.id, second.id)).toEqual(['placed-several-ways'])
    })

    it('reports a command paired with itself', () => {
        const { current, version, first, stating } = setUp()
        stating(first, command => { command.pairedWith = assignReference(first.id) })

        expect(problemsWith(current(), version.id, first.id)).toEqual(['paired-with-itself'])
    })

    it('reports a command claimed by several pairs', () => {
        const { current, version, first, second, third, stating } = setUp()
        stating(first, command => { command.pairedWith = assignReference(second.id) })
        stating(third, command => { command.pairedWith = assignReference(second.id) })

        expect(problemsWith(current(), version.id, second.id)).toEqual(['in-several-pairs'])
        expect(problemsWith(current(), version.id, first.id)).toEqual([])
    })

    it('reports a pair whose members are both placed', () => {
        const { current, version, first, second, note, stating } = setUp()
        stating(first, command => { command.alignedWith = assignReference(note.id) })
        stating(second, command => { command.after = assignReference(note.id) })
        stating(first, command => { command.pairedWith = assignReference(second.id) })

        expect(problemsWith(current(), version.id, first.id)).toEqual(['pair-placed-on-both-sides'])
        expect(problemsWith(current(), version.id, second.id)).toEqual(['pair-placed-on-both-sides'])
    })
})

/**
 * A green version derived from a red one, as the transfer between the
 * two systems leaves it: the notes collate away and every red
 * expression is inherited into a vocabulary that has no word for it.
 */
const afterTransfer = () => {
    const red = version('A', [{
        type: 'edit',
        id: 'edit-a',
        insert: [
            note('note', 60, 'hole-note'),
            expression('forzando-on', 'ForzandoOn', 'hole-on'),
            expression('forzando-off', 'ForzandoOff', 'hole-off')
        ]
    }])

    const green: Version = {
        ...version('B', [], 'A'),
        system: systemOf(welteT98)
    }

    return editionOf(
        [copy('red', [
            hole('hole-note', 1000, 1010, 47),
            hole('hole-on', 990, 992, 95),
            hole('hole-off', 1004, 1006, 96)
        ])],
        [red, green]
    )
}

describe('reporting a transfer between systems that is unfinished', () => {
    const typesNotRead = (edition: ReturnType<typeof afterTransfer>, versionId: string) =>
        constraintProblems(edition)
            .filter(problem => problem.problem === 'type-not-on-the-bar' && problem.version === versionId)
            .map(problem => problem.symbol)

    it('reports every inherited expression the green bar cannot read', () => {
        const edition = afterTransfer()
        expect(typesNotRead(edition, 'B')).toEqual(['forzando-on', 'forzando-off'])
    })

    it('says nothing of the same symbols in the red version they belong to', () => {
        const edition = afterTransfer()
        expect(typesNotRead(edition, 'A')).toEqual([])
    })

    it('empties as the edits delete what the green system has no word for', () => {
        const edition = afterTransfer()
        edition.versions[1].edits = [{
            type: 'edit',
            id: 'edit-b',
            delete: ['forzando-on', 'forzando-off'],
            insert: [expression('sforzando', 'SforzandoForte', 'hole-on')]
        }]

        expect(typesNotRead(edition, 'B')).toEqual([])
    })

    it('reports nothing where it has no bar for the version\'s system', () => {
        const edition = afterTransfer()
        edition.versions[1].system = { id: 'https://example.org/system/duo-art', name: 'Duo-Art', sameAs: [] }

        expect(typesNotRead(edition, 'B')).toEqual([])
    })
})
