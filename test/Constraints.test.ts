import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation } from '../src/Emulation'
import { assignReference } from '../src/Assumption'
import { Expression, Note } from '../src/Symbol'
import { constraintProblems } from '../src/validate'
import { flat } from './flat'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')

/**
 * A fresh edition for every test, with the first version's placed
 * perforations at hand: three expressions and a note, in order of place.
 */
const setUp = () => {
    const edition = importJsonLd(JSON.parse(file))
    const view = new EditionView(edition)
    const version = edition.versions[0]
    const placed = view.snapshot(version.id).filter(s => view.dimensionOf(s) !== undefined)
    const [first, second, third] = placed.filter((s): s is Expression => s.type === 'expression')
    const note = placed.find((s): s is Note => s.type === 'note')!
    const onsetOf = (symbol: Note | Expression) => view.dimensionOf(symbol)!.horizontal.from
    const lengthOf = (symbol: Note | Expression) => {
        const { from, to } = view.dimensionOf(symbol)!.horizontal
        return to - from
    }
    const emulate = () => {
        const emulation = new Emulation(flat)
        emulation.emulateVersion(version, view)
        const placedAs = (symbol: Note | Expression) => emulation.negotiatedEvents.find(e => e.id === symbol.id)!.horizontal
        return placedAs
    }
    return { edition, view, version, first, second, third, note, onsetOf, lengthOf, emulate }
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

    it('finds nothing to report in the edition as it is', () => {
        const { view } = setUp()
        expect(constraintProblems(view)).toEqual([])
    })

    it('reports a missing reference and a missing partner', () => {
        const { view, version, first, second } = setUp()
        first.alignedWith = assignReference('nowhere')
        second.pairedWith = assignReference('nowhere')

        expect(problemsWith(view, version.id, first.id)).toEqual(['alignment-reference-missing'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['partner-missing'])
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

    it('reports a pair whose members are both aligned', () => {
        const { view, version, first, second, note } = setUp()
        first.alignedWith = assignReference(note.id)
        second.alignedWith = assignReference(note.id)
        first.pairedWith = assignReference(second.id)

        expect(problemsWith(view, version.id, first.id)).toEqual(['pair-aligned-on-both-sides'])
        expect(problemsWith(view, version.id, second.id)).toEqual(['pair-aligned-on-both-sides'])
    })
})
