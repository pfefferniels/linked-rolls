import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { edition } from './editionFixture'
import { lineageOf, withGenerations } from '../src/analysis/stemma'
import { snapshotOf } from '../src/analysis/text'
import { assignReference } from '../src/model/Assumption'
import { derivesFrom } from '../src/model/Version'
import { connectVersions, stateDerivation } from '../src/ops'

/**
 * In the fixture B derives from A. A stemma that loops has no root to
 * read a text from, so neither operation may make A derive from B.
 */
describe('a stemma that would loop', () => {
    it('knows what a version derives from, through the versions between', () => {
        const { versions } = edition()
        expect(derivesFrom(versions, 'B', 'A')).toBe(true)
        expect(derivesFrom(versions, 'A', 'B')).toBe(false)
    })

    it('does not state a derivation from a descendant', () => {
        const e = edition()
        expect(produce(e, stateDerivation('A', 'B'))).toBe(e)
    })

    it('does not connect a version to its descendant', () => {
        const e = edition()
        expect(produce(e, connectVersions('A', 'B'))).toBe(e)
    })

    it('reads an edition that loops already, walking the loop once', () => {
        const e = edition()
        const looped = produce(e, draft => {
            draft.versions.find(v => v.id === 'A')!.basedOn = [assignReference('B')]
        })
        expect(lineageOf(looped, 'A').map(v => v.id)).toEqual(['A', 'B'])
        expect(() => snapshotOf(looped, 'A')).not.toThrow()
    })

    it('draws an edition that loops already, counting the loop once round', () => {
        const e = edition()
        expect(withGenerations(e).map(v => [v.id, v.generation])).toEqual([['A', 0], ['B', 1]])

        const looped = produce(e, draft => {
            draft.versions.find(v => v.id === 'A')!.basedOn = [assignReference('B')]
        })
        expect(withGenerations(looped).map(v => [v.id, v.generation])).toEqual([['A', 1], ['B', 1]])
    })
})
