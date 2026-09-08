import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { AnyFeature, Hole, Mark, Transcription, Writing, conditions } from '../src/Feature'
import { ConditionState } from '../src/ConditionState'
import { Note } from '../src/Symbol'
import { ObjectAssumption, ReferenceAssumption, assignObject, assignReference, idsOf } from '../src/Assumption'
import { mergeFeatures, mergeObstacle } from '../src/editionOps'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { mm, track } from '../src/Quantity'

const depicted = (feature: Hole, region: string): Hole => ({ ...feature, depiction: region })

/** The two halves the scan made of one perforation, with a gap between them. */
const partOne = depicted(hole('part-one', 1000, 1004, 47), 'canvas#xywh=0,0,20,8')
const partTwo = depicted(hole('part-two', 1006, 1010, 47), 'canvas#xywh=0,12,20,8')
const elsewhere = hole('other', 1020, 1030, 49)

const damage = <T extends string>(conditionType: T): ObjectAssumption<ConditionState<T>> =>
    assignObject<ConditionState<T>>({ type: 'ConditionState', conditionType })

const torn = damage(conditions.Hole[0])

/**
 * A copy whose scan split one perforation in two, each half read as a
 * note of its own, and a third hole standing apart. Version B, based on
 * A, names none of the halves.
 */
const scan = (features: AnyFeature[] = [partOne, partTwo, elsewhere]) => editionOf(
    [copy('first', features)],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [note('one', 60, 'part-one'), note('two', 60, 'part-two'), note('apart', 62, 'other')]
        }]),
        version('B', [{ type: 'edit', id: 'edit-b', delete: ['apart'] }], 'A')
    ]
)

const merge = (edition: Edition, ...featureIds: string[]) =>
    produce(edition, mergeFeatures('first', featureIds))

const featuresOf = (edition: Edition) => edition.copies[0].features
const carriersOf = (edition: Edition, symbolId: string) =>
    idsOf(new EditionView(edition).get<Note>(symbolId)!.carriers)

describe('merging the features of a copy', () => {
    it('replaces them with one spanning them all, the gap between them included', () => {
        const [merged, ...rest] = featuresOf(merge(scan(), 'part-one', 'part-two'))

        expect(rest.map(feature => feature.id)).toEqual(['other'])
        expect(merged.type).toBe('Hole')
        expect(merged.horizontal).toEqual({ unit: 'mm', from: 1000, to: 1010 })
        expect(merged.vertical).toEqual({ unit: 'track', from: 47 })
        expect(['part-one', 'part-two']).not.toContain(merged.id)
    })

    it('drops the depiction, a region showing one half depicting no more than that half', () => {
        expect('depiction' in featuresOf(merge(scan(), 'part-one', 'part-two'))[0]).toBe(false)
    })

    it('lets the merged feature carry what the halves carried', () => {
        const next = merge(scan(), 'part-one', 'part-two')
        const mergedId = featuresOf(next)[0].id

        expect(carriersOf(next, 'one')).toEqual([mergedId])
        expect(carriersOf(next, 'two')).toEqual([mergedId])
        expect(carriersOf(next, 'apart')).toEqual(['other'])
    })

    it('names the merged feature once where a symbol carried several halves, keeping what was believed of the first', () => {
        const believed: ReferenceAssumption = {
            ...assignReference('part-one'),
            '@annotation': { id: 'annotation', belief: { type: 'belief', id: 'belief', certainty: 'likely', reasons: [] } }
        }
        const before = editionOf(
            [copy('first', [partOne, partTwo])],
            [version('A', [{
                type: 'edit',
                id: 'edit-a',
                insert: [{ ...note('one', 60), carriers: [believed, assignReference('part-two')] }]
            }])]
        )
        const next = merge(before, 'part-one', 'part-two')
        const mergedId = featuresOf(next)[0].id

        expect(new EditionView(next).get<Note>('one')!.carriers)
            .toEqual([{ ...believed, id: mergedId }])
    })

    it('keeps the condition the one half states, holding of the whole perforation', () => {
        const next = merge(scan([partOne, { ...partTwo, condition: torn }]), 'part-one', 'part-two')
        const [merged] = featuresOf(next)

        expect(merged.condition).toEqual(torn)
        expect(merged.horizontal).toEqual({ unit: 'mm', from: 1000, to: 1010 })
    })

    it('touches nothing it does not merge', () => {
        const before = scan()
        const next = merge(before, 'part-one', 'part-two')

        expect(featuresOf(next)[1]).toBe(featuresOf(before)[2])
        expect(next.versions[1]).toBe(before.versions[1])
        expect(next.versions[0].edits[0].insert![2]).toBe(before.versions[0].edits[0].insert![2])
    })

    it('leaves the edition as it is for a copy it does not have', () => {
        const before = scan()
        expect(produce(before, mergeFeatures('nothing', ['part-one', 'part-two']))).toBe(before)
    })

    it('refuses features that cannot stand for one, naming what stands in the way', () => {
        expect(() => merge(scan(), 'part-one', 'other')).toThrow('different-tracks')
        expect(() => merge(scan(), 'part-one')).toThrow('fewer-than-two')
        expect(() => merge(scan(), 'part-one', 'nowhere')).toThrow('fewer-than-two')
    })
})

const mark = (id: string, from: number, to: number): Mark => ({
    type: 'Mark',
    id,
    horizontal: { unit: 'mm', from: mm(from), to: mm(to) },
    vertical: { unit: 'track', from: track(47) }
})

const writing = (id: string, text: string): Writing => ({
    type: 'Writing',
    id,
    horizontal: { unit: 'mm', from: mm(1000), to: mm(1004) },
    vertical: { unit: 'track', from: track(47) },
    method: 'Handwriting',
    transcription: assignObject<Transcription>({ type: 'text', id: `${id}-text`, text })
})

describe('asking what stands in the way of a merge', () => {
    it('lets features pass that differ in nothing but their place, their depiction and one condition', () => {
        expect(mergeObstacle([partOne, partTwo])).toBeUndefined()
        expect(mergeObstacle([partOne, { ...partTwo, condition: torn }])).toBeUndefined()
        expect(mergeObstacle([{ ...partOne, condition: torn }, { ...partTwo, condition: damage(conditions.Hole[0]) }]))
            .toBeUndefined()
        expect(mergeObstacle([{ ...partOne, pattern: undefined }, partTwo])).toBeUndefined()
        expect(mergeObstacle([writing('a', 'Welte'), writing('b', 'Welte')])).toBeUndefined()
    })

    it('names what keeps them apart', () => {
        expect(mergeObstacle([])).toBe('fewer-than-two')
        expect(mergeObstacle([partOne])).toBe('fewer-than-two')
        expect(mergeObstacle([partOne, mark('a-mark', 1006, 1010)])).toBe('different-types')
        expect(mergeObstacle([partOne, elsewhere])).toBe('different-tracks')
        expect(mergeObstacle([partOne, { ...partTwo, vertical: { unit: 'track', from: track(47), to: track(48) } }]))
            .toBe('different-tracks')
        expect(mergeObstacle([partOne, { ...partTwo, pattern: 'accelerating' }])).toBe('unlike-features')
        expect(mergeObstacle([writing('a', 'Welte'), writing('b', 'Welte-Mignon')])).toBe('unlike-features')
        expect(mergeObstacle([{ ...partOne, condition: torn }, { ...partTwo, condition: damage(conditions.Hole[1]) }]))
            .toBe('differing-conditions')
    })
})
