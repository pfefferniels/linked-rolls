import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { GluedOn, NestedFeature, Transcription, withBorneFeatures } from '../src/Feature'
import { Modification, RollCopy } from '../src/RollCopy'
import {
    AnyArgumentation, Assumption, Belief, MeaningComprehension, assignObject, assignReference
} from '../src/Assumption'
import { mergeFeatures, mergeObstacle, removeCopy, removeFeatures, symbolsCarriedOnlyBy } from '../src/editionOps'
import { copy, editionOf, hole, label, note, version } from './editionFixture'
import { mm, track } from '../src/Quantity'

/** A writing as a patch bears it, standing where the patch stands and stating no place of its own. */
const writing = (id: string, text: string): NestedFeature => ({
    type: 'Writing',
    id,
    method: 'Print',
    transcription: assignObject<Transcription>({ type: 'text', id: `${id}-text`, text })
})

const patch = (id: string, from: number, to: number, features?: NestedFeature[]): GluedOn => ({
    type: 'GluedOn',
    id,
    horizontal: { unit: 'mm', from: mm(from), to: mm(to) },
    vertical: { unit: 'track', from: track(40), to: track(57) },
    material: 'Paper',
    ...(features && { features })
})

const addition = (...added: string[]): Modification => ({ type: 'Addition', purpose: 'labeling', added })

const comprehension = (...comprehends: string[]): MeaningComprehension =>
    ({ type: 'meaningComprehension', comprehends })

/** An annotation holding the statement true for the given reasons. */
const believed = (...reasons: AnyArgumentation[]): Assumption => ({
    '@annotation': { id: 'annotation', belief: { type: 'belief', id: 'belief', certainty: 'true', reasons } }
})

/**
 * A copy bearing a label patch, on which the title is printed and a
 * second patch is glued carrying a stamp, two strips of tape the scan
 * split in two, and a hole beside them. The title is read as a text
 * symbol, the hole as a note. A second copy bears a hole of its own,
 * and states the condition held true for the given reasons.
 */
const labelled = (...reasons: AnyArgumentation[]): Edition => {
    const first: RollCopy = {
        ...copy('first', [
            patch('label-patch', 280, 340, [
                writing('title', 'Träumerei'),
                patch('stamp-patch', 300, 310, [writing('stamp', 'Welte')])
            ]),
            patch('tape', 500, 520),
            patch('tape-too', 522, 540),
            hole('hole-note', 1000, 1010, 47)
        ]),
        modifications: [addition('label-patch', 'title', 'stamp'), addition('tape', 'tape-too')]
    }
    const second: RollCopy = {
        ...copy('second', [hole('own', 2000, 2010, 47)]),
        conditions: [{ type: 'ConditionState', conditionType: 'general', ...believed(...reasons) }]
    }

    return editionOf(
        [first, second],
        [version('A', [
            {
                type: 'edit',
                id: 'edit-title',
                insert: [{ ...label('title-symbol', 'Träumerei'), carriers: [assignReference('title')] }]
            },
            { type: 'edit', id: 'edit-note', insert: [note('note', 60, 'hole-note')] }
        ])]
    )
}

const featureIds = (edition: Edition, copyId = 'first') =>
    edition.copies.find(c => c.id === copyId)!.features.flatMap(withBorneFeatures).map(feature => feature.id)

const addedIn = (edition: Edition) => edition.copies[0].modifications.flatMap(modification =>
    modification.type === 'Addition' ? [modification.added] : [])

const beliefOf = (annotated: Assumption): Belief => annotated['@annotation']!.belief

const comprehendedBy = (edition: Edition) => beliefOf(edition.copies.find(c => c.id === 'second')!.conditions[0])
    .reasons.map(reason => reason.type === 'meaningComprehension' ? reason.comprehends : reason.type)

const insertedIds = (edition: Edition) =>
    edition.versions[0].edits.flatMap(edit => edit.insert?.map(symbol => symbol.id) ?? [])

describe('removing what a patch bears', () => {
    it('takes what a patch bears out of the copy with the patch, as deep as the bearing goes', () => {
        expect(featureIds(produce(labelled(), removeFeatures('first', ['label-patch']))))
            .toEqual(['tape', 'tape-too', 'hole-note'])
    })

    it('strikes what a patch bore from a modification and from a comprehension', () => {
        const next = produce(
            labelled(comprehension('title', 'stamp', 'hole-note')),
            removeFeatures('first', ['label-patch']))

        expect(addedIn(next)).toEqual([['tape', 'tape-too']])
        expect(comprehendedBy(next)).toEqual([['hole-note']])
    })

    it('takes the symbol which a feature of the patch alone carried', () => {
        expect(insertedIds(produce(labelled(), removeFeatures('first', ['label-patch']))))
            .toEqual(['note'])
    })

    it('takes a feature of a patch back on its own, the patch staying where it is', () => {
        const next = produce(labelled(comprehension('title', 'stamp')), removeFeatures('first', ['title']))

        expect(featureIds(next)).toEqual(['label-patch', 'stamp-patch', 'stamp', 'tape', 'tape-too', 'hole-note'])
        expect(addedIn(next)).toEqual([['label-patch', 'stamp'], ['tape', 'tape-too']])
        expect(comprehendedBy(next)).toEqual([['stamp']])
        expect(insertedIds(next)).toEqual(['note'])
    })

    it('reaches a patch glued onto a patch', () => {
        const next = produce(labelled(comprehension('stamp')), removeFeatures('first', ['stamp-patch']))

        expect(featureIds(next)).toEqual(['label-patch', 'title', 'tape', 'tape-too', 'hole-note'])
        expect(addedIn(next)).toEqual([['label-patch', 'title'], ['tape', 'tape-too']])
        expect(comprehendedBy(next)).toEqual([])
    })

    it('leaves the edition as it is for a feature the copy does not bear', () => {
        const before = labelled(comprehension('own', 'title'))

        expect(produce(before, removeFeatures('first', ['own']))).toBe(before)
    })
})

describe('removing a copy that bears a patch', () => {
    it('names the symbol which a feature of the patch alone carries', () => {
        expect(symbolsCarriedOnlyBy(labelled(), 'first').map(symbol => symbol.id))
            .toEqual(['title-symbol', 'note'])
    })

    it('strikes what a patch on it bore from a comprehension', () => {
        const next = produce(labelled(comprehension('title', 'stamp', 'own')), removeCopy('first'))

        expect(next.copies.map(kept => kept.id)).toEqual(['second'])
        expect(comprehendedBy(next)).toEqual([['own']])
    })
})

describe('merging where a patch bears features', () => {
    it('passes over an id naming a feature of a patch', () => {
        const next = produce(labelled(comprehension('title')), mergeFeatures('first', ['tape', 'tape-too', 'title']))
        const mergedId = next.copies[0].features[1].id

        expect(featureIds(next)).toEqual(['label-patch', 'title', 'stamp-patch', 'stamp', mergedId, 'hole-note'])
        expect(addedIn(next)).toEqual([['label-patch', 'title', 'stamp'], [mergedId]])
        expect(comprehendedBy(next)).toEqual([['title']])
    })

    it('keeps patches apart that bear features of their own', () => {
        const one = patch('one', 280, 300, [writing('one-title', 'Träumerei')])
        const other = patch('other', 302, 340, [writing('other-title', 'Träumerei')])

        expect(mergeObstacle([one, other])).toBe('unlike-features')
        expect(mergeObstacle([patch('one', 280, 300), patch('other', 302, 340)])).toBeUndefined()
    })
})
