import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { AnyFeature, FeatureConditionType, GluedOn, Mark, Transcription, Writing } from '../src/Feature'
import { ConditionState } from '../src/ConditionState'
import { GeneralRollCondition, PaperStretch } from '../src/RollCopy'
import { ObjectAssumption, assignObject } from '../src/Assumption'
import { addGeneralCondition, stateFeatureCondition } from '../src/editionOps'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { mm, track } from '../src/Quantity'

const damage = <T extends FeatureConditionType>(conditionType: T): ObjectAssumption<ConditionState<T>> =>
    assignObject<ConditionState<T>>({ type: 'ConditionState', conditionType })

const general = (description: string): ObjectAssumption<GeneralRollCondition> =>
    assignObject<GeneralRollCondition>({ type: 'ConditionState', conditionType: 'general', description })

const stretch = assignObject<PaperStretch>({ type: 'ConditionState', conditionType: 'paper-stretch', factor: 1.02 })

const at = (from: number, to: number) => ({
    horizontal: { unit: 'mm' as const, from: mm(from), to: mm(to) },
    vertical: { unit: 'track' as const, from: track(47) }
})

const writing: Writing = {
    type: 'Writing',
    id: 'label',
    ...at(20, 60),
    method: 'Handwriting',
    transcription: assignObject<Transcription>({ type: 'text', id: 'label-text', text: 'Welte' })
}

const mark: Mark = { type: 'Mark', id: 'pencil', ...at(80, 90) }

const patch: GluedOn = { type: 'GluedOn', id: 'patch', ...at(100, 140), material: 'Paper' }

/** A copy carrying one feature of each kind, and a version reading its hole as a note. */
const withFeatures = (features: AnyFeature[] = [hole('hole-note', 1000, 1010, 47), writing, mark, patch]) =>
    editionOf(
        [copy('first', features)],
        [version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'hole-note')] }])]
    )

const featuresOf = (edition: Edition) => edition.copies[0].features
const conditionOf = (edition: Edition, featureId: string) =>
    featuresOf(edition).find(feature => feature.id === featureId)?.condition

describe('adding a condition to a copy', () => {
    const stretched = (): Edition => {
        const before = withFeatures()
        before.copies[0].conditions = [stretch]
        return before
    }

    it('adds it beside what is stated of the copy already', () => {
        const wear = general('browned along the edges')
        const next = produce(stretched(), addGeneralCondition('first', wear))

        expect(next.copies[0].conditions).toEqual([stretch, wear])
    })

    it('leaves the edition as it is for a copy it does not have', () => {
        const before = withFeatures()
        expect(produce(before, addGeneralCondition('nothing', general('torn')))).toBe(before)
    })
})

describe('stating the condition of a feature', () => {
    const state = (edition: Edition, featureId: string, condition: ObjectAssumption<ConditionState<FeatureConditionType>>) =>
        produce(edition, stateFeatureCondition('first', featureId, condition))

    it('states it on the feature the copy carries', () => {
        const torn = damage('partially-torn')
        expect(conditionOf(state(withFeatures(), 'hole-note', torn), 'hole-note')).toEqual(torn)
    })

    it('takes the place of an earlier statement', () => {
        const missing = damage('missing-perforation')
        const stated = state(withFeatures(), 'hole-note', damage('partially-torn'))

        expect(conditionOf(state(stated, 'hole-note', missing), 'hole-note')).toEqual(missing)
    })

    it('states of each kind of feature the conditions its own kind may be in', () => {
        const stated = (featureId: string, condition: ObjectAssumption<ConditionState<FeatureConditionType>>) =>
            conditionOf(state(withFeatures(), featureId, condition), featureId)

        expect(stated('hole-note', damage('missing-perforation'))).toEqual(damage('missing-perforation'))
        expect(stated('label', damage('illegible'))).toEqual(damage('illegible'))
        expect(stated('pencil', damage('faded'))).toEqual(damage('faded'))
        expect(stated('patch', damage('ripped'))).toEqual(damage('ripped'))
    })

    it('refuses a condition of a kind the feature is in no such, naming its kind', () => {
        expect(() => state(withFeatures(), 'hole-note', damage('illegible')))
            .toThrow("A Hole is in no 'illegible' condition")
        expect(() => state(withFeatures(), 'label', damage('faded'))).toThrow('Writing')
        expect(() => state(withFeatures(), 'patch', damage('partially-torn'))).toThrow('GluedOn')
    })

    it('leaves the edition as it is for a feature or a copy it does not have', () => {
        const before = withFeatures()
        const torn = damage('partially-torn')

        expect(produce(before, stateFeatureCondition('first', 'nowhere', torn))).toBe(before)
        expect(produce(before, stateFeatureCondition('nothing', 'hole-note', torn))).toBe(before)
    })

    it('touches no other feature and nothing of the versions', () => {
        const before = withFeatures()
        const next = state(before, 'hole-note', damage('partially-torn'))

        expect(featuresOf(next)[1]).toBe(featuresOf(before)[1])
        expect(next.versions[0]).toBe(before.versions[0])
    })
})
