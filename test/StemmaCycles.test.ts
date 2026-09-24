import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { edition } from './editionFixture'
import { EditionView } from '../src/EditionView'
import { assignReference } from '../src/Assumption'
import { derivesFrom } from '../src/Version'
import { connectVersions, stateDerivation } from '../src/editionOps'

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
        expect(produce(e, connectVersions(new EditionView(e), 'A', 'B'))).toBe(e)
    })

    it('reads an edition that loops already, walking the loop once', () => {
        const e = edition()
        const looped = produce(e, draft => {
            draft.versions.find(v => v.id === 'A')!.basedOn = [assignReference('B')]
        })
        const view = new EditionView(looped)
        expect(view.lineageOf('A').map(v => v.id)).toEqual(['A', 'B'])
        expect(() => view.snapshot('A')).not.toThrow()
    })
})
