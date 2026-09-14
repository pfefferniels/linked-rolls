import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { EditionView } from '../src/EditionView'
import { Belief, Certainty, idOf } from '../src/Assumption'
import { Derivation, derivationsOf, principalDerivationOf, Version } from '../src/Version'
import { clearDerivation, connectVersions, removeSymbols, removeVersion, stateDerivation } from '../src/editionOps'
import { reservationsAboutVersion } from '../src/reservations'
import { migrate } from '../src/migrate'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { Edition } from '../src/Edition'

const belief = (certainty: Certainty): Belief => ({ type: 'belief', id: `belief-${certainty}`, certainty, reasons: [] })

const from = (parent: string, certainty?: Certainty): Derivation => ({
    id: parent,
    ...(certainty && { '@annotation': { id: `annotation-${parent}`, belief: belief(certainty) } })
})

/** A version S stating no edits of its own and deriving as given. */
const deriving = (...derivations: Derivation[]): Version => ({ ...version('S', []), basedOn: derivations })

/** Three versions standing on their own, each inserting a note, and whatever version is added. */
const editionWith = (...added: Version[]): Edition => editionOf(
    [copy('first', [hole('hole-a', 1000, 1010, 47), hole('hole-b', 1100, 1110, 49), hole('hole-c', 1200, 1210, 51)])],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note-a', 60, 'hole-a')] }]),
        version('B', [{ type: 'edit', id: 'edit-b', insert: [note('note-b', 62, 'hole-b')] }]),
        version('C', [{ type: 'edit', id: 'edit-c', insert: [note('note-c', 64, 'hole-c')] }]),
        ...added
    ]
)

const principalOf = (derived: Version): string | undefined => {
    const principal = principalDerivationOf(derived)
    return principal && idOf(principal)
}

const textOf = (edition: Edition, versionId: string): string[] =>
    new EditionView(edition).snapshot(versionId).map(symbol => symbol.id)

const versionIn = (edition: Edition, versionId: string): Version =>
    edition.versions.find(candidate => candidate.id === versionId)!

describe('the derivation a version is read against', () => {
    it('is the first, where no derivation carries a belief', () => {
        expect(principalOf(deriving(from('A'), from('B')))).toBe('A')
    })

    it('is the most certain, a derivation without a belief being held true', () => {
        expect(principalOf(deriving(from('A', 'likely'), from('B')))).toBe('B')
    })

    it('may be one held possible, where nothing is held more certain', () => {
        expect(principalOf(deriving(from('A', 'unlikely'), from('B', 'possible')))).toBe('B')
    })

    it('is never one held unlikely or false', () => {
        const rejected = deriving(from('A', 'unlikely'), from('B', 'false'))
        expect(principalOf(rejected)).toBeUndefined()
        expect(textOf(editionWith(rejected), 'S')).toEqual([])
    })

    it('gives the text, which a hypothesis beside it leaves alone', () => {
        const edition = editionWith(deriving(from('C'), from('B', 'possible')))
        const view = new EditionView(edition)

        expect(textOf(edition, 'S')).toEqual(['note-c'])
        expect(view.predecessorOf('S')?.id).toBe('C')
        expect(view.withGenerations().find(candidate => candidate.id === 'S')?.generation).toBe(1)
        expect(derivationsOf(versionIn(edition, 'S'))).toEqual([
            { parent: 'C', certainty: 'true' },
            { parent: 'B', certainty: 'possible', belief: belief('possible') }
        ])
    })
})

describe('stating and clearing a hypothesis of derivation', () => {
    const readFromC = () => editionWith(version('S', [], 'C'))

    it('adds the derivation under its belief and reads the text as before', () => {
        const next = produce(readFromC(), stateDerivation('S', 'B', belief('possible')))

        expect(derivationsOf(versionIn(next, 'S'))).toEqual([
            { parent: 'C', certainty: 'true' },
            { parent: 'B', certainty: 'possible', belief: belief('possible') }
        ])
        expect(textOf(next, 'S')).toEqual(['note-c'])
    })

    it('states no derivation from the version itself, nor a second from one parent', () => {
        const before = readFromC()
        expect(produce(before, stateDerivation('S', 'S'))).toBe(before)
        expect(produce(before, stateDerivation('S', 'C', belief('likely')))).toBe(before)
    })

    it('takes a hypothesis back, but not the derivation the text is read against', () => {
        const hypothesised = produce(readFromC(), stateDerivation('S', 'B', belief('possible')))

        const cleared = produce(hypothesised, clearDerivation('S', 'B'))
        expect(derivationsOf(versionIn(cleared, 'S'))).toEqual([{ parent: 'C', certainty: 'true' }])
        expect(produce(hypothesised, clearDerivation('S', 'C'))).toBe(hypothesised)
    })
})

describe('connecting and removing where hypotheses are stated', () => {
    it('replaces the principal derivation and keeps the hypotheses', () => {
        const before = editionWith(deriving(from('A'), from('B', 'possible')))
        const next = produce(before, connectVersions(new EditionView(before), 'S', 'C'))

        expect(derivationsOf(versionIn(next, 'S'))).toEqual([
            { parent: 'C', certainty: 'true' },
            { parent: 'B', certainty: 'possible', belief: belief('possible') }
        ])
        expect(versionIn(next, 'S').basedOn![0].collationTolerance).toBeDefined()
    })

    it('drops a hypothesis that names the version removed, and keeps the text', () => {
        const before = editionWith(deriving(from('C'), from('B', 'possible')))
        const next = produce(before, removeVersion(new EditionView(before), 'B'))

        expect(derivationsOf(versionIn(next, 'S'))).toEqual([{ parent: 'C', certainty: 'true' }])
        expect(textOf(next, 'S')).toEqual(['note-c'])
    })
})

describe('a version that does not state its text', () => {
    const unstated = (): Version => {
        const { edits, ...rest } = version('S', [], 'C')
        return rest
    }

    it('reads as the version it derives from, and says so', () => {
        const view = new EditionView(editionWith(unstated()))
        expect(textOf(editionWith(unstated()), 'S')).toEqual(['note-c'])
        expect(reservationsAboutVersion(view, unstated()).map(reservation => reservation.type))
            .toEqual(['text-not-stated'])
        expect(reservationsAboutVersion(view, version('S', [], 'C'))).toEqual([])
    })

    it('stays unstated where an operation on its edits finds none', () => {
        const before = editionWith(unstated())
        expect(produce(before, removeSymbols('S', ['note-c']))).toBe(before)
    })
})

describe('reading derivations written one to a version', () => {
    it('makes a list of the one, and leaves a list as it is', () => {
        const migrated = migrate({ versions: [{ '@type': 'Version', '@id': 'B', basedOn: { '@id': 'A' } }] })
        expect(migrated.versions[0].basedOn).toEqual([{ '@id': 'A' }])
        expect(migrate(migrated)).toEqual(migrated)
    })

    it('quotes a hypothesis held possible and reads it back beside the principal derivation', () => {
        const edition = editionWith(deriving(from('C'), from('B', 'possible')))
        const exported = asJsonLd(edition)
        const exportedS = exported.versions.find((candidate: any) => candidate['@id'] === 'S')

        expect(exportedS.basedOn).toEqual([{ '@id': 'C' }])
        expect(exported['@included']).toContainEqual(expect.objectContaining({
            '@id': { '@id': 'S', basedOn: [{ '@id': 'B' }] }
        }))
        expect(importJsonLd(JSON.parse(JSON.stringify(exported))).versions).toEqual(edition.versions)
    })
})
