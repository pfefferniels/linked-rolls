import { describe, expect, it } from 'vitest'
import { EditionView } from '../src/EditionView'
import { copy, editionOf, expression, hole, note, version } from './editionFixture'
import { mm } from '../src/Quantity'
import { Expression, Note } from '../src/Symbol'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { systemOf } from '../src/TrackerBar'
import { Version } from '../src/Version'
import { constraintProblems } from '../src/constraints'
import { assignObject } from '../src/Assumption'
import { PaperStretch } from '../src/RollCopy'

/** B, based on A and listed before it, its derivation stating the tolerance it was collated at. */
const childFirst = () => {
    const edition = editionOf(
        [copy('first', [hole('hole-note', 1000, 1010, 47)])],
        [
            version('B', [], 'A'),
            version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'hole-note')] }])
        ]
    )
    edition.versions[0].basedOn!.collationTolerance = { toleranceStart: mm(1), toleranceEnd: mm(1) }
    return edition
}

describe('indexing an edition', () => {
    it('reads a derivation stating a tolerance as a reference, not as the version it names', () => {
        const view = new EditionView(childFirst())
        expect(view.predecessorOf('B')?.siglum).toEqual('A')
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

        expect(seen.simplifySymbol(sounded, welteT100)?.vertical.from).toBe(47)
        expect(seen.simplifySymbol(sounded, welteT98)?.vertical.from).toBe(45)
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

        expect(seen.simplifySymbol(forzando, welteT100)?.vertical.from).toBe(95)
        expect(seen.simplifySymbol(forzando, welteT98)).toBeNull()
    })
})

/**
 * The red copy sets the edition's place axis; the green copy of the
 * same recording was scaled onto it by 1.29072, the figure the
 * alignment of Welte 225 measured, and its scale is put down to the
 * speed rather than to the paper.
 */
const twoIssues = () => {
    const edition = editionOf(
        [
            { ...copy('red', [hole('hole-red', 1000, 1010, 47)]) },
            {
                ...copy('green', [hole('hole-green', 1000, 1010, 45)]),
                production: { system: systemOf(welteT98) },
                ops: ['stretched'] as Array<'shifted' | 'stretched'>,
                measurements: { scale: 1.29072 }
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
    it('takes a green version back off the shared axis onto its own paper', () => {
        const view = new EditionView(twoIssues())
        const green = view.get<Version>('B')!

        expect(view.toOwnPaperOf(green)).toBeCloseTo(1 / 1.29072, 9)
        expect(view.toOwnPaperOf(green)! * 1000).toBeCloseTo(774.76, 2)
    })

    it('says nothing for a version whose copies were never scaled', () => {
        const view = new EditionView(twoIssues())
        expect(view.toOwnPaperOf(view.get<Version>('A')!)).toBeUndefined()
    })

    /**
     * A stretch belongs to the one exemplar and says nothing about the
     * speed its system's rolls were cut at, so it must not be read as a
     * paper factor.
     */
    it('leaves out a scale put down to the copy having stretched', () => {
        const edition = twoIssues()
        edition.copies[1].conditions = [assignObject<PaperStretch>({
            type: 'ConditionState', conditionType: 'paper-stretch', factor: 1.29072
        })]

        const view = new EditionView(edition)
        expect(view.toOwnPaperOf(view.get<Version>('B')!)).toBeUndefined()
    })

    it('reports copies of one system that disagree instead of averaging them', () => {
        const edition = twoIssues()
        edition.copies.push({
            ...copy('green-other', [hole('hole-green-other', 1000, 1010, 45)]),
            production: { system: systemOf(welteT98) },
            ops: ['stretched'],
            measurements: { scale: 1.35 }
        })
        edition.versions[1].edits.push({
            type: 'edit', id: 'edit-b2',
            insert: [note('note-green-other', 62, 'hole-green-other')]
        })

        const view = new EditionView(edition)
        expect(view.toOwnPaperOf(view.get<Version>('B')!)).toBeUndefined()
        expect(constraintProblems(view).map(problem => problem.problem))
            .toContain('copies-disagree-on-the-paper')
    })
})
