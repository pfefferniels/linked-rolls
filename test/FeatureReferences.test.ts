import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { Modification, RollCopy } from '../src/RollCopy'
import { AnyArgumentation, Assumption, Belief, MeaningComprehension } from '../src/Assumption'
import { mergeFeatures, removeCopy, removeFeatures } from '../src/editionOps'
import { copy, editionOf, hole, note, version } from './editionFixture'

const addition = (...added: string[]): Modification => ({ type: 'Addition', purpose: 'repair', added })

const comprehension = (...comprehends: string[]): MeaningComprehension =>
    ({ type: 'meaningComprehension', comprehends })

/** An annotation holding the statement true for the given reasons. */
const believed = (...reasons: AnyArgumentation[]): Assumption => ({
    '@annotation': { id: 'annotation', belief: { type: 'belief', id: 'belief', certainty: 'true', reasons } }
})

/**
 * A copy bearing three patches, two of which a note is read off and one
 * standing apart, with its condition held true for the given reasons.
 */
const repaired = (modifications: Modification[], ...reasons: AnyArgumentation[]): RollCopy => ({
    ...copy('first', [
        hole('patch', 1000, 1010, 47),
        hole('patch-too', 1012, 1020, 47),
        hole('apart', 1100, 1110, 49)
    ]),
    modifications,
    conditions: [{ type: 'ConditionState', conditionType: 'general', ...believed(...reasons) }]
})

const repairs = () => [addition('patch', 'patch-too'), addition('apart'), addition()]

const roll = (modifications: Modification[] = repairs(), ...reasons: AnyArgumentation[]): Edition => editionOf(
    [repaired(modifications, ...reasons)],
    [version('A', [
        { type: 'edit', id: 'edit-patch', insert: [note('note', 60, 'patch')] },
        { type: 'edit', id: 'edit-apart', insert: [note('apart-note', 62, 'apart')] }
    ])]
)

/** The edition with the recording date held true for the given reasons, as the roll's own dating. */
const datedBy = (edition: Edition, ...reasons: AnyArgumentation[]): Edition => ({
    ...edition,
    roll: {
        ...edition.roll,
        recordingEvent: {
            ...edition.roll.recordingEvent,
            date: { ...edition.roll.recordingEvent.date, ...believed(...reasons) }
        }
    }
})

const modificationsOf = (edition: Edition) => edition.copies[0].modifications.map(modification =>
    modification.type === 'Addition' ? modification.added : modification.removed)

const beliefOf = (annotated: Assumption): Belief => annotated['@annotation']!.belief

const conditionBelief = (edition: Edition) => beliefOf(edition.copies[0].conditions[0])

const dateBelief = (edition: Edition) => beliefOf(edition.roll.recordingEvent.date)

const comprehendedBy = (belief: Belief) => belief.reasons.map(reason =>
    reason.type === 'meaningComprehension' ? reason.comprehends : reason.type)

describe('removing what a modification or a comprehension names', () => {
    it('strikes the feature the copy no longer holds from the modification that added it', () => {
        expect(modificationsOf(produce(roll(), removeFeatures('first', ['patch-too']))))
            .toEqual([['patch'], ['apart'], []])
    })

    it('drops a modification left naming nothing, keeping one that named nothing before', () => {
        expect(modificationsOf(produce(roll(), removeFeatures('first', ['patch', 'patch-too']))))
            .toEqual([['apart'], []])
    })

    it('strikes the feature and the symbol that went with it from what a comprehension comprehends', () => {
        const before = roll(repairs(), comprehension('patch', 'note', 'apart-note'))

        expect(comprehendedBy(conditionBelief(produce(before, removeFeatures('first', ['patch'])))))
            .toEqual([['apart-note']])
    })

    it('strikes an edit the removal emptied', () => {
        const before = roll(repairs(), comprehension('edit-patch', 'edit-apart'))

        expect(comprehendedBy(conditionBelief(produce(before, removeFeatures('first', ['patch'])))))
            .toEqual([['edit-apart']])
    })

    it('drops a comprehension left comprehending nothing, leaving the belief that was held for it', () => {
        const before = roll(repairs(), comprehension('patch'), comprehension())
        const next = produce(before, removeFeatures('first', ['patch']))

        expect(comprehendedBy(conditionBelief(next))).toEqual([[]])
        expect(conditionBelief(next).certainty).toBe('true')
    })

    it('reaches an argumentation outside the copies and the versions', () => {
        const before = datedBy(roll(), comprehension('patch', 'apart'))

        expect(comprehendedBy(dateBelief(produce(before, removeFeatures('first', ['patch'])))))
            .toEqual([['apart']])
    })

    it('leaves a reason that names nothing of what went as the very object it was', () => {
        const reason: AnyArgumentation = { type: 'beliefAdoption', note: 'Phillips 2016, p. 112' }
        const before = roll(repairs(), reason)
        const next = produce(before, removeFeatures('first', ['patch']))

        expect(conditionBelief(next).reasons[0]).toBe(conditionBelief(before).reasons[0])
    })

    it('strikes what the copy carried from a comprehension when the copy goes', () => {
        const before = datedBy(roll(), comprehension('patch', 'note', 'nothing-of-ours'))

        expect(comprehendedBy(dateBelief(produce(before, removeCopy('first')))))
            .toEqual([['nothing-of-ours']])
    })

    it('leaves a copy that stays behind holding what was rewritten on it', () => {
        const held: RollCopy = {
            ...copy('second', [hole('own', 2000, 2010, 47)]),
            conditions: [{
                type: 'ConditionState',
                conditionType: 'general',
                ...believed(comprehension('patch', 'own'))
            }]
        }
        const before = produce(roll(), draft => { draft.copies.push(held) })
        const next = produce(before, removeCopy('first'))

        expect(next.copies.map(kept => kept.id)).toEqual(['second'])
        expect(comprehendedBy(conditionBelief(next))).toEqual([['own']])
    })
})

describe('merging what a modification or a comprehension names', () => {
    const merged = (edition: Edition) => produce(edition, mergeFeatures('first', ['patch', 'patch-too']))
    const featureIdOf = (edition: Edition) => edition.copies[0].features[0].id

    it('names the merged feature once where a modification named the halves', () => {
        const next = merged(roll())

        expect(modificationsOf(next)).toEqual([[featureIdOf(next)], ['apart'], []])
    })

    it('names the merged feature once where a comprehension named the halves', () => {
        const next = merged(roll(repairs(), comprehension('apart', 'patch', 'patch-too')))

        expect(comprehendedBy(conditionBelief(next))).toEqual([['apart', featureIdOf(next)]])
    })

    it('leaves a modification that names neither half as it was', () => {
        const before = roll()
        const next = merged(before)

        expect(next.copies[0].modifications[1]).toBe(before.copies[0].modifications[1])
    })
})
