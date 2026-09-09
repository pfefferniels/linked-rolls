import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation } from '../src/Emulation'
import { assignReference } from '../src/Assumption'
import { Expression, Note } from '../src/Symbol'
import { constraintProblems } from '../src/constraints'
import { flat } from './flat'
import { mean, Millimeters, mm } from '../src/Quantity'
import { copy, editionOf, expression, hole, note, version } from './editionFixture'
import { Version } from '../src/Version'
import { systemOf } from '../src/TrackerBar'
import { welteT98 } from '../src/systems/welteT98/bar'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')

/**
 * A fresh edition for every test, with the first version's placed
 * perforations at hand: three expressions and a note, in order of place.
 */
const setUp = () => {
    const edition = importJsonLd(JSON.parse(file))
    const view = new EditionView(edition)
    const version = edition.versions[0]
    const placed = view.snapshot(version.id).filter(s => view.placeOf(s) !== undefined)
    const [first, second, third] = placed.filter((s): s is Expression => s.type === 'expression')
    const note = placed.find((s): s is Note => s.type === 'note')!
    const onsetOf = (symbol: Note | Expression) => view.placeOf(symbol)!.from
    const lengthOf = (symbol: Note | Expression) => {
        const { from, to } = view.placeOf(symbol)!
        return to - from
    }
    const emulate = () => {
        const emulation = new Emulation(flat)
        emulation.emulateVersion(version, view)
        const placedAs = (symbol: Note | Expression) => emulation.negotiatedEvents.find(e => e.id === symbol.id)!.horizontal
        return placedAs
    }

    const copyOf = (featureId: string) => view.getPath(featureId)?.[1]
    const onsetOn = (symbol: Note | Expression, copy: number | string | undefined) => {
        const carrier = view.carriersOf(symbol).find(c => copyOf(c.id) === copy)
        if (!carrier) throw new Error(`${symbol.id} has no carrier on copy ${copy}`)
        return carrier.horizontal.from
    }
    /**
     * Moves every hole carrying a symbol so that on each copy it starts
     * the given distance, by the copy's index, from the reference's
     * onset there, keeping each hole's length.
     */
    const placeBeside = (symbol: Note | Expression, reference: Note | Expression, distances: readonly number[]) => {
        view.carriersOf(symbol).forEach(({ id, horizontal }) => {
            const copy = copyOf(id)
            const distance = typeof copy === 'number' ? distances[copy] : undefined
            if (distance === undefined) throw new Error(`no distance for copy ${copy}`)
            const length = horizontal.to - horizontal.from
            horizontal.from = mm(onsetOn(reference, copy) + distance)
            horizontal.to = mm(horizontal.from + length)
        })
    }

    const punchDiameters = edition.copies
        .map(copy => copy.measurements.punchDiameter?.value)
        .filter((value): value is Millimeters => value !== undefined && value > 0)
    /** What the performance falls back on where no copy agrees with a statement. */
    const gap = mean(punchDiameters)

    return { edition, view, version, first, second, third, note, onsetOf, lengthOf, placeBeside, gap, emulate }
}

describe('aligning a perforation with another', () => {
    it('takes the onset of the reference and keeps its length', () => {
        const { first, note, onsetOf, lengthOf, emulate } = setUp()
        first.alignedWith = assignReference(note.id)

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(note))
        expect(placedAs(first).to - placedAs(first).from).toBeCloseTo(lengthOf(first))
        expect(placedAs(note).from).toEqual(onsetOf(note))
    })

    it('follows a chain of references to its end', () => {
        const { first, second, note, onsetOf, emulate } = setUp()
        first.alignedWith = assignReference(second.id)
        second.alignedWith = assignReference(note.id)

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(note))
        expect(placedAs(second).from).toEqual(onsetOf(note))
    })

    it('leaves a perforation whose reference is absent where it is', () => {
        const { first, onsetOf, emulate } = setUp()
        first.alignedWith = assignReference('nowhere')

        expect(emulate()(first).from).toEqual(onsetOf(first))
    })
})

describe('placing a perforation before or after another', () => {
    it('leaves it where the measurement already has it on that side', () => {
        const { first, note, onsetOf, placeBeside, emulate } = setUp()
        placeBeside(first, note, [-5, -3, -4])
        first.before = assignReference(note.id)

        expect(emulate()(first).from).toEqual(onsetOf(first))
    })

    it('puts it on that side as far as the copies that agree put it', () => {
        const { first, note, onsetOf, placeBeside, emulate } = setUp()
        placeBeside(first, note, [-2, 6, 8])
        first.before = assignReference(note.id)

        expect(onsetOf(first)).toBeGreaterThan(onsetOf(note))
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) - 2)
    })

    it('does the same after', () => {
        const { first, note, onsetOf, placeBeside, emulate } = setUp()
        placeBeside(first, note, [2, -6, -8])
        first.after = assignReference(note.id)

        expect(onsetOf(first)).toBeLessThan(onsetOf(note))
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) + 2)
    })

    it('puts it a punch diameter away where no copy agrees', () => {
        const { first, note, onsetOf, placeBeside, gap, emulate } = setUp()
        placeBeside(first, note, [3, 6, 4])
        first.before = assignReference(note.id)

        expect(gap).toBeGreaterThan(0)
        expect(emulate()(first).from).toBeCloseTo(onsetOf(note) - gap)
    })

    it('judges the side against where the reference comes to lie', () => {
        const { first, second, note, onsetOf, placeBeside, gap, emulate } = setUp()
        second.alignedWith = assignReference(note.id)
        placeBeside(first, note, [4, 4, 4])
        first.before = assignReference(second.id)

        const placedAs = emulate()
        expect(placedAs(second).from).toEqual(onsetOf(note))
        expect(placedAs(first).from).toBeCloseTo(onsetOf(note) - gap)
    })
})

describe('pairing two perforations', () => {
    it('moves the partner by the same distance', () => {
        const { first, second, note, onsetOf, emulate } = setUp()
        first.alignedWith = assignReference(note.id)
        second.pairedWith = assignReference(first.id)

        const placedAs = emulate()
        const displacement = placedAs(first).from - onsetOf(first)
        expect(displacement).not.toEqual(0)
        expect(placedAs(second).from - onsetOf(second)).toEqual(displacement)
        expect(placedAs(second).from - placedAs(first).from).toBeCloseTo(onsetOf(second) - onsetOf(first))
    })

    it('holds in both directions', () => {
        const { first, second, note, onsetOf, emulate } = setUp()
        first.alignedWith = assignReference(note.id)
        first.pairedWith = assignReference(second.id)

        const placedAs = emulate()
        expect(placedAs(second).from - onsetOf(second)).toEqual(placedAs(first).from - onsetOf(first))
    })

    it('leaves a pair alone when neither member is aligned', () => {
        const { first, second, onsetOf, emulate } = setUp()
        first.pairedWith = assignReference(second.id)

        const placedAs = emulate()
        expect(placedAs(first).from).toEqual(onsetOf(first))
        expect(placedAs(second).from).toEqual(onsetOf(second))
    })
})

describe('reporting constraints that cannot hold', () => {
    const problemsWith = (view: EditionView, versionId: string, symbolId: string) =>
        constraintProblems(view)
            .filter(problem => problem.version === versionId && problem.symbol === symbolId)
            .map(problem => problem.problem)

    it('finds no placement or pairing to report in the edition as it is', () => {
        const { view } = setUp()
        const stated = constraintProblems(view)
            .filter(problem => problem.problem !== 'carrier-on-another-track')
        expect(stated).toEqual([])
    })

    /**
     * A real fault in the 0.1 fixture rather than a contrived one: four
     * of its symbols name carriers that say something else, a treble
     * SustainPedalOff on track 94 also claiming note holes on 59 and a
     * crescendo hole on 4. Nothing checked the tracks of a carrier
     * before, so it went unnoticed.
     */
    it('reports a carrier sitting on a track that does not say what its symbol says', () => {
        const { view } = setUp()
        const reported = constraintProblems(view)
            .filter(problem => problem.problem === 'carrier-on-another-track')

        expect(new Set(reported.map(problem => problem.symbol)).size).toBe(4)
        reported.forEach(({ symbol }) => {
            const carried = view.get<Note | Expression>(symbol)!
            const tracks = view.carriersOf(carried).map(carrier => carrier.vertical.from)
            expect(new Set(tracks).size).toBeGreaterThan(1)
        })
    })

    it('says nothing of carriers that agree across two systems', () => {
        const { view, note } = setUp()
        expect(problemsWith(view, view.edition.versions[0].id, note.id)).toEqual([])
    })

    it('reports a missing reference and a missing partner', () => {
        const { view, version, first, second } = setUp()
        first.alignedWith = assignReference('nowhere')
        second.pairedWith = assignReference('nowhere')

        expect(problemsWith(view, version.id, first.id)).toEqual(['alignment-reference-missing'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['partner-missing'])
    })

    it('reports a missing reference of an order as well', () => {
        const { view, version, first, second } = setUp()
        first.before = assignReference('nowhere')
        second.after = assignReference('nowhere')

        expect(problemsWith(view, version.id, first.id)).toEqual(['before-reference-missing'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['after-reference-missing'])
    })

    it('reports a perforation placed relative to itself or in several ways', () => {
        const { view, version, first, second, note } = setUp()
        first.before = assignReference(first.id)
        second.alignedWith = assignReference(note.id)
        second.after = assignReference(note.id)

        expect(problemsWith(view, version.id, first.id)).toEqual(['placed-relative-to-itself'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['placed-several-ways'])
    })

    it('reports a perforation paired with itself', () => {
        const { view, version, first } = setUp()
        first.pairedWith = assignReference(first.id)

        expect(problemsWith(view, version.id, first.id)).toEqual(['paired-with-itself'])
    })

    it('reports a perforation claimed by several pairs', () => {
        const { view, version, first, second, third } = setUp()
        first.pairedWith = assignReference(second.id)
        third.pairedWith = assignReference(second.id)

        expect(problemsWith(view, version.id, second.id)).toEqual(['in-several-pairs'])
        expect(problemsWith(view, version.id, first.id)).toEqual([])
    })

    it('reports a pair whose members are both placed', () => {
        const { view, version, first, second, note } = setUp()
        first.alignedWith = assignReference(note.id)
        second.after = assignReference(note.id)
        first.pairedWith = assignReference(second.id)

        expect(problemsWith(view, version.id, first.id)).toEqual(['pair-placed-on-both-sides'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['pair-placed-on-both-sides'])
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
        constraintProblems(new EditionView(edition))
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
