import { describe, expect, it } from 'vitest'
import { EditionView } from '../src/EditionView'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { mm } from '../src/Quantity'

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
