import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { copyIn, versionIn } from '../src/lookup/lookup'
import { getAt, linksTo, pathIn } from '../src/lookup/paths'
import { predecessorOf } from '../src/analysis/stemma'
import { placeOf, snapshotOf } from '../src/analysis/text'
import { stateOf } from '../src/ops/draft'
import { removeSymbols } from '../src/ops/versions'
import { Edition } from '../src/model/Edition'
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
        const seen = childFirst()
        expect(predecessorOf(seen, 'B')?.id).toEqual('A')
        expect(snapshotOf(seen, 'B').map(symbol => symbol.id)).toEqual(['note'])
        expect(pathIn(seen, 'A')).toEqual(['versions', 1])
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
    const noteOf = (edition: Edition) => snapshotOf(edition, 'A')[0] as Note

    it('takes the middle of the places its carriers measure', () => {
        const seen = carriedByBoth()
        expect(placeOf(seen, noteOf(seen))).toEqual({ unit: 'mm', from: 1000.5, to: 1010.5 })
    })

    /** A mean would begin the note at 1004 mm, where no copy has it. */
    it('is not drawn away by one copy that puts the note well off the others', () => {
        const seen = editionOf(
            [
                copy('first', [hole('hole-first', 1000, 1010, 47)]),
                copy('second', [hole('hole-second', 1001, 1011, 47)]),
                copy('stretched', [hole('hole-stretched', 1011, 1018, 47)])
            ],
            [version('A', [{
                type: 'edit',
                id: 'edit-a',
                insert: [note('note', 60, 'hole-first', 'hole-second', 'hole-stretched')]
            }])]
        )
        expect(placeOf(seen, noteOf(seen))).toEqual({ unit: 'mm', from: 1001, to: 1011 })
    })

    /**
     * The mean of 47 and 45 is 46, which both bars read as a legal note
     * a semitone away, so nothing would fail loudly. The track is asked
     * of a bar instead.
     */
    it('takes the track from the bar and never from the mean of the carriers', () => {
        const seen = carriedByBoth()
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
        const forzando = snapshotOf(edition, 'A')[0] as Expression

        expect(negotiatedEventOf(edition, forzando, welteT100)?.vertical.from).toBe(95)
        expect(negotiatedEventOf(edition, forzando, welteT98)).toBeNull()
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
        const edition = twoIssues()
        const green = versionIn(edition, 'B')!

        expect(toOwnPaperOf(edition, green)).toBeCloseTo(1 / 1.29072, 9)
    })

    it('leaves a version of the reference copy\'s own system on the axis, where that copy alone measures the paper', () => {
        const edition = twoIssues()
        expect(toOwnPaperOf(edition, versionIn(edition, 'A')!)).toBeCloseTo(1, 8)
    })

    it('takes a stretch measured on the copy out of the ratio of the papers', () => {
        const edition = twoIssues()
        edition.copies[1].conditions = [assignObject<PaperStretch>({
            conditionType: 'paper-stretch',
            along: { value: percent(1), uncertainty: percent(0.01), unit: 'percent' }
        })]

        expect(toOwnPaperOf(edition, versionIn(edition, 'B')!)).toBeCloseTo(1 / (1.29072 * 1.01), 5)
    })

    it('says nothing for a version of a system no copy measures', () => {
        const edition = twoIssues()
        edition.copies.pop()
        expect(toOwnPaperOf(edition, versionIn(edition, 'B')!)).toBeUndefined()
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

        expect(constraintProblems(edition).map(problem => problem.problem))
            .toContain('copies-disagree-on-the-paper')
    })
})

describe('what is known of a state', () => {
    it('works a snapshot out once for each state and hands everyone the same', () => {
        const seen = edition()
        expect(snapshotOf(seen, 'A')).toBe(snapshotOf(seen, 'A'))
        expect(Object.isFrozen(snapshotOf(seen, 'A'))).toBe(true)
    })

    it('answers a new state afresh', () => {
        const before = edition()
        const struck = snapshotOf(before, 'A')[0]
        const after = produce(before, removeSymbols('A', [struck.id]))

        expect(snapshotOf(after, 'A')).not.toContain(struck)
        expect(snapshotOf(before, 'A')).toContain(struck)
        expect(pathIn(after, struck.id)).toBeUndefined()
    })

    /** What was worked out would otherwise stay behind unnoticed. */
    it('freezes a state it was asked about, so that it cannot be changed in place', () => {
        const seen = edition()
        versionIn(seen, 'A')
        expect(() => { seen.versions.pop() }).toThrow()
        expect(() => { seen.copies[0].modifications = [] }).toThrow()
        expect(copyIn(seen, seen.copies[0].id)).toBe(seen.copies[0])
    })

    it('reads a draft only as a state taken of it', () => {
        const seen = edition()
        produce(seen, draft => {
            expect(() => snapshotOf(draft, 'A')).toThrow(/stateOf\(draft\)/)
            expect(stateOf(draft)).toBe(seen)
            expect(snapshotOf(stateOf(draft), 'A')).toBe(snapshotOf(seen, 'A'))
        })
    })

    it('records each reference once, however often it is asked', () => {
        const seen = edition()
        const before = linksTo(seen, 'forzando-on')
        expect(before.length).toBeGreaterThan(0)
        expect(linksTo(seen, 'forzando-on')).toEqual(before)
    })

    it('returns what stands at a path, a zero included', () => {
        const seen = editionOf([copy('first', [hole('at-start', 0, 5, 47)])], [])
        const path = [...pathIn(seen, 'at-start')!, 'horizontal', 'from']
        expect(getAt<number>(path, seen)).toBe(0)
        expect(getAt(['copies', 0, 'measurements', 'nothing'], seen)).toBeUndefined()
    })
})
