import { describe, expect, it } from 'vitest'
import { EditionView } from '../src/view/EditionView'
import { toOwnPaperOf } from '../src/analysis/ownPaper'
import { negotiatedEventOf } from '../src/emulation/negotiation'
import { copy, cutFor, edition, editionOf, expression, hole, note, version } from './editionFixture'
import { mm, percent, track } from '../src/model/Quantity'
import { Expression, Note } from '../src/model/Symbol'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { systemOf } from '../src/systems/TrackerBar'
import { constraintProblems } from '../src/analysis/constraints'
import { assignObject } from '../src/model/Assumption'
import { PaperStretch } from '../src/model/RollCopy'

/** B, based on A and listed before it, its derivation stating the tolerance it was collated at. */
const childFirst = () => {
    const edition = editionOf(
        [copy('first', [hole('hole-note', 1000, 1010, 47)])],
        [
            version('B', [], 'A'),
            version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'hole-note')] }])
        ]
    )
    edition.versions[0].basedOn![0].collationTolerance = { toleranceStart: mm(1), toleranceEnd: mm(1) }
    return edition
}

describe('indexing an edition', () => {
    it('reads a derivation stating a tolerance as a reference, not as the version it names', () => {
        const view = new EditionView(childFirst())
        expect(view.predecessorOf('B')?.id).toEqual('A')
        expect(view.snapshot('B').map(symbol => symbol.id)).toEqual(['note'])
        expect(view.getPath('A')).toEqual(['versions', 1])
    })
})

/**
 * One note of the recording, carried by a red copy and by a green one.
 * The green code stands on the red places, the copies having been
 * aligned onto one axis, but the two bars number the note block two
 * tracks apart.
 */
const carriedByBoth = () => editionOf(
    [
        copy('red', [hole('hole-red', 1000, 1010, 47)]),
        copy('green', [hole('hole-green', 1001, 1011, 45)])
    ],
    [version('A', [{
        type: 'edit',
        id: 'edit-a',
        insert: [note('note', 60, 'hole-red', 'hole-green')]
    }])]
)

describe('where a symbol lies and which track it sits on', () => {
    const view = () => new EditionView(carriedByBoth())
    const noteOf = (view: EditionView) => view.snapshot('A')[0] as Note

    it('averages the place its carriers measure', () => {
        const seen = view()
        expect(seen.placeOf(noteOf(seen))).toEqual({ unit: 'mm', from: 1000.5, to: 1010.5 })
    })

    /**
     * The mean of 47 and 45 is 46, which both bars read as a legal note
     * a semitone away, so nothing would fail loudly. The track is asked
     * of a bar instead.
     */
    it('takes the track from the bar and never from the mean of the carriers', () => {
        const seen = view()
        const sounded = noteOf(seen)
        expect(welteT100.positionOf(sounded)).toBe(47)
        expect(welteT98.positionOf(sounded)).toBe(45)

        expect(negotiatedEventOf(seen, sounded, welteT100)?.vertical.from).toBe(47)
        expect(negotiatedEventOf(seen, sounded, welteT98)?.vertical.from).toBe(45)
    })

    it('performs nothing of a symbol the performing bar has no word for', () => {
        const edition = editionOf(
            [copy('red', [hole('hole-on', 990, 992, 95)])],
            [version('A', [{
                type: 'edit',
                id: 'edit-a',
                insert: [expression('forzando-on', 'ForzandoOn', 'hole-on')]
            }])]
        )
        const seen = new EditionView(edition)
        const forzando = seen.snapshot('A')[0] as Expression

        expect(negotiatedEventOf(seen, forzando, welteT100)?.vertical.from).toBe(95)
        expect(negotiatedEventOf(seen, forzando, welteT98)).toBeNull()
    })
})

/** An alignment by the scale alone. */
const scaledBy = (scale: number) => ({ alignment: { shift: { horizontal: mm(0), vertical: track(0) }, scale } })

/**
 * The red copy sets the edition's place axis; the green copy of the
 * same recording was scaled onto it by 1.29072, the figure the
 * alignment of Welte 225 measured.
 */
const twoIssues = () => {
    const edition = editionOf(
        [
            { ...copy('red', [hole('hole-red', 1000, 1010, 47)]) },
            {
                ...cutFor(copy('green', [hole('hole-green', 1000, 1010, 45)]), systemOf(welteT98)),
                measurements: scaledBy(1.29072)
            }
        ],
        [
            version('A', [{
                type: 'edit', id: 'edit-a',
                insert: [note('note', 60, 'hole-red')]
            }]),
            {
                ...version('B', [{
                    type: 'edit', id: 'edit-b',
                    insert: [note('note-green', 60, 'hole-green')]
                }], 'A'),
                system: systemOf(welteT98)
            }
        ]
    )
    return edition
}

describe('the paper a version ran on', () => {
    /**
     * With one green copy the ratio of the papers takes the whole scale:
     * nothing tells the copy's own stretch apart from the speed it was
     * cut for, so the one is left at nothing and the other takes all.
     */
    it('takes a green version back off the shared axis onto its own paper', () => {
        const view = new EditionView(twoIssues())
        const green = view.version('B')!

        expect(toOwnPaperOf(view, green)).toBeCloseTo(1 / 1.29072, 9)
    })

    it('leaves a version of the reference copy\'s own system on the axis, where that copy alone measures the paper', () => {
        const view = new EditionView(twoIssues())
        expect(toOwnPaperOf(view, view.version('A')!)).toBeCloseTo(1, 8)
    })

    it('takes a stretch measured on the copy out of the ratio of the papers', () => {
        const edition = twoIssues()
        edition.copies[1].conditions = [assignObject<PaperStretch>({
            conditionType: 'paper-stretch',
            along: { value: percent(1), uncertainty: percent(0.01), unit: 'percent' }
        })]

        const view = new EditionView(edition)
        expect(toOwnPaperOf(view, view.version('B')!)).toBeCloseTo(1 / (1.29072 * 1.01), 5)
    })

    it('says nothing for a version of a system no copy measures', () => {
        const edition = twoIssues()
        edition.copies.pop()
        const view = new EditionView(edition)
        expect(toOwnPaperOf(view, view.version('B')!)).toBeUndefined()
    })

    it('reports copies of one system that disagree beyond what paper does', () => {
        const edition = twoIssues()
        edition.copies.push({
            ...cutFor(copy('green-other', [hole('hole-green-other', 1000, 1010, 45)]), systemOf(welteT98)),
            measurements: scaledBy(1.35)
        })
        edition.versions[1].edits.push({
            type: 'edit', id: 'edit-b2',
            insert: [note('note-green-other', 62, 'hole-green-other')]
        })

        const view = new EditionView(edition)
        expect(constraintProblems(view).map(problem => problem.problem))
            .toContain('copies-disagree-on-the-paper')
    })
})

describe('the index of a view', () => {
    it('records each reference once, however often it is built', () => {
        const seen = new EditionView(edition())
        const before = seen.linksTo('forzando-on')
        seen.indexObjects()
        expect(seen.linksTo('forzando-on')).toEqual(before)
    })

    it('returns what stands at a path, a zero included', () => {
        const seen = new EditionView(editionOf([copy('first', [hole('at-start', 0, 5, 47)])], []))
        const path = [...seen.getPath('at-start')!, 'horizontal', 'from']
        expect(seen.atPath<number>(path)).toBe(0)
        expect(seen.atPath(['copies', 0, 'measurements', 'nothing'])).toBeNull()
    })
})
