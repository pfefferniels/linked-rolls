import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { copy, editionOf, hole, note, version } from './editionFixture'
import { EditionView } from '../src/view/EditionView'
import { AnyArgumentation, Belief, Certainty, certaintyOf, idOf } from '../src/model/Assumption'
import { RollCopy } from '../src/model/RollCopy'
import { Version } from '../src/model/Version'
import { Edition } from '../src/model/Edition'
import { addCopy, clearCarriage, EditionOp, removeVersion, stateCarriage } from '../src/ops'
import { attestedVersions, carriageProblems, versionsWitnessedBy, witnessesOf } from '../src/analysis/witnesses'
import { reservationsAboutVersion } from '../src/analysis/reservations'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { migrate } from '../src/io/migrate'

const belief = (certainty: Certainty, ...reasons: AnyArgumentation[]): Belief =>
    ({ type: 'belief', id: `belief-${certainty}`, certainty, reasons })

/** A copy known only from a recording: no features, and nobody known to hold it. */
const recorded = (): RollCopy => {
    const { keeper: _unknown, ...unheld } = copy('recorded', [])
    return { ...unheld, readFrom: { kind: 'recording' } }
}

/** S derives from C and states no edits. */
const hypothetical = (): Version => {
    const { edits: _unstated, ...rest } = version('S', [], 'C')
    return rest
}

/** A on a paper copy, C based on A with a note of its own on the same copy, S hypothetical, and a recorded copy. */
const edition = (): Edition => editionOf(
    [copy('paper', [hole('hole-a', 1000, 1010, 47), hole('hole-c', 1100, 1110, 49)]), recorded()],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note-a', 60, 'hole-a')] }]),
        version('C', [{ type: 'edit', id: 'edit-c', insert: [note('note-c', 62, 'hole-c')] }], 'A'),
        hypothetical()
    ]
)

/** A, C on A and D on C, each inserting a note of its own, and one copy carrying all three. */
const chain = (): Edition => editionOf(
    [copy('roll', [hole('hole-a', 1000, 1010, 47), hole('hole-c', 1100, 1110, 49), hole('hole-d', 1200, 1210, 51)])],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note-a', 60, 'hole-a')] }]),
        version('C', [{ type: 'edit', id: 'edit-c', insert: [note('note-c', 62, 'hole-c')] }], 'A'),
        version('D', [{ type: 'edit', id: 'edit-d', insert: [note('note-d', 64, 'hole-d')] }], 'C')
    ]
)

/** The edition with the recorded copy stating it carries the versions, each under the certainty given. */
const stating = (...statements: [string, Certainty][]): Edition =>
    statements.reduce((next, [versionId, certainty]) =>
        produce(next, stateCarriage('recorded', versionId, belief(certainty))), edition())

/** The edition after each operation in turn. */
const applying = (start: Edition, ...ops: EditionOp[]): Edition =>
    ops.reduce((next, op) => produce(next, op), start)

const statementsOf = (edition: Edition, copyId: string) =>
    (edition.copies.find(candidate => candidate.id === copyId)?.carries ?? [])
        .map(statement => [idOf(statement), certaintyOf(statement)])

describe('adding a copy known only from a recording', () => {
    it('adds the copy and no version', () => {
        const before = editionOf([], [version('C', [])])
        const next = produce(before, addCopy(recorded()))

        expect(next.copies.map(added => added.id)).toEqual(['recorded'])
        expect(next.versions.map(existing => existing.id)).toEqual(['C'])
    })
})

describe('a copy stating which versions it carries', () => {
    it('states each version once, under its belief', () => {
        const next = stating(['C', 'likely'], ['S', 'possible'], ['A', 'unlikely'])

        expect(statementsOf(next, 'recorded')).toEqual([['C', 'likely'], ['S', 'possible'], ['A', 'unlikely']])
        expect(produce(next, stateCarriage('recorded', 'C', belief('true')))).toBe(next)
    })

    it('takes a statement back, and the list with the last one', () => {
        const next = stating(['C', 'likely'], ['S', 'possible'])

        expect(statementsOf(produce(next, clearCarriage('recorded', 'S')), 'recorded')).toEqual([['C', 'likely']])
        const cleared = applying(next, clearCarriage('recorded', 'S'), clearCarriage('recorded', 'C'))
        expect(cleared.copies[1]).not.toHaveProperty('carries')
    })

    it('loses the statement with the version it names', () => {
        const next = stating(['C', 'likely'], ['S', 'possible'])
        const removed = produce(next, removeVersion(new EditionView(next), 'S'))

        expect(statementsOf(removed, 'recorded')).toEqual([['C', 'likely']])
    })
})

describe('the witnesses of a version', () => {
    it('counts a copy by what the version inserts, and a statement with its certainty and belief', () => {
        const view = new EditionView(stating(['C', 'likely'], ['S', 'possible']))

        expect(witnessesOf(view, 'A')).toEqual([{ copy: 'paper', by: 'carriers', through: 'C' }])
        expect(witnessesOf(view, 'C')).toEqual([
            { copy: 'paper', by: 'carriers' },
            { copy: 'recorded', by: 'statement', certainty: 'likely', belief: belief('likely') }
        ])
        expect(witnessesOf(view, 'S')).toEqual([{ copy: 'recorded', by: 'statement', certainty: 'possible', belief: belief('possible') }])
    })

    it('names the later version a copy bears witness through, and leaves the latest one it carries direct', () => {
        const view = new EditionView(chain())
        const through = (versionId: string) => witnessesOf(view, versionId).map(witness => witness.through)

        expect(through('A')).toEqual(['D'])
        expect(through('C')).toEqual(['D'])
        expect(through('D')).toEqual([undefined])
    })

    it('reads past a version that inserts nothing, which leaves the text as it found it', () => {
        const unstated = produce(chain(), draft => { draft.versions.push(version('E', [], 'D')) })

        expect(witnessesOf(new EditionView(unstated), 'D')).toEqual([{ copy: 'roll', by: 'carriers' }])
        expect(witnessesOf(new EditionView(unstated), 'E')).toEqual([])
    })

    it('gathers the versions carried at first hand, passing over those a statement alone attests', () => {
        expect(attestedVersions(new EditionView(chain()))).toEqual(new Set(['D']))
        expect(attestedVersions(new EditionView(stating(['S', 'possible'])))).toEqual(new Set(['C']))
    })

    it('gathers the versions a copy bears witness to, in the order of the edition', () => {
        const view = new EditionView(stating(['S', 'possible'], ['C', 'likely']))

        expect(versionsWitnessedBy(view, 'paper').map(({ version, by, through }) => [version, by, through]))
            .toEqual([['A', 'carriers', 'C'], ['C', 'carriers', undefined]])
        expect(versionsWitnessedBy(view, 'recorded').map(({ version, certainty }) => [version, certainty]))
            .toEqual([['C', 'likely'], ['S', 'possible']])
    })

    it('reports a version to which only statements bear witness', () => {
        const next = stating(['C', 'likely'], ['S', 'possible'])
        const view = new EditionView(next)
        const typesFor = (versionId: string) =>
            reservationsAboutVersion(view, next.versions.find(candidate => candidate.id === versionId)!)
                .map(reservation => reservation.type)

        expect(typesFor('S')).toEqual(['text-not-stated', 'witnessed-by-statement-only'])
        expect(typesFor('C')).toEqual([])
    })

    it('reports a version no copy carries at first hand, and says nothing of one with no witness at all', () => {
        const next = chain()
        const view = new EditionView(next)
        const typesFor = (versionId: string) =>
            reservationsAboutVersion(view, next.versions.find(candidate => candidate.id === versionId)!)
                .map(reservation => reservation.type)

        expect(typesFor('A')).toEqual(['no-direct-witness'])
        expect(typesFor('C')).toEqual(['no-direct-witness'])
        expect(typesFor('D')).toEqual([])
        expect(reservationsAboutVersion(new EditionView(editionOf([], [version('X', [])])), version('X', [])))
            .toEqual([])
    })
})

describe('statements of carriage that cannot stand', () => {
    it('reports one beside features that carry symbols, and one naming a version the edition lacks', () => {
        const next = applying(stating(['C', 'likely']), stateCarriage('paper', 'C'), stateCarriage('recorded', 'missing'))

        expect(carriageProblems(new EditionView(next))).toEqual([
            { copy: 'paper', version: 'C', problem: 'stated-beside-carriers' },
            { copy: 'recorded', version: 'missing', problem: 'version-missing' }
        ])
    })

    it('finds nothing to report where only the recorded copy states', () => {
        expect(carriageProblems(new EditionView(stating(['C', 'likely'])))).toEqual([])
    })
})

describe('exporting what a copy carries', () => {
    const analysis = 'https://welte225.org/schmitz-225/trans/report_data.json'

    /** C held likely for a reason that cites the analysis, then A held unlikely: quoted statements come back last. */
    const argued = (): Edition => applying(edition(),
        stateCarriage('recorded', 'C', belief('likely', {
            type: 'inference',
            note: 'Note loudness follows the dynamics C emulates better than those of A or B.',
            premises: [],
            used: [analysis, 'C']
        })),
        stateCarriage('recorded', 'A', belief('unlikely')))

    it('states a carriage held likely and quotes one held unlikely', () => {
        const exported = asJsonLd(argued())
        const exportedCopy = exported.copies.find((candidate: any) => candidate['@id'] === 'recorded')

        expect(exportedCopy.carries).toEqual([expect.objectContaining({ '@id': 'C' })])
        expect(exported['@included']).toContainEqual(expect.objectContaining({
            '@id': { '@id': 'recorded', carries: [{ '@id': 'A' }] }
        }))
    })

    it('reads both back, with what the inference used', () => {
        const before = argued()
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(before))))

        expect(back.copies).toEqual(before.copies)
    })
})

describe('reading copies written before a sound recording could be a source', () => {
    it('reads a copy with holes stated as a recording as a reading, and leaves one without holes alone', () => {
        const migrated = migrate({
            copies: [
                { '@type': 'RollCopy', '@id': 'eroll', readFrom: { kind: 'recording' }, features: [{ '@type': 'Hole', '@id': 'h' }] },
                { '@type': 'RollCopy', '@id': 'tacet', readFrom: { kind: 'recording' }, features: [] }
            ]
        })

        expect(migrated.copies.map((migratedCopy: any) => migratedCopy.readFrom.kind)).toEqual(['reading', 'recording'])
        expect(migrate(migrated)).toEqual(migrated)
    })

    it('drops a keeper nobody named, and keeps one with a name', () => {
        const migrated = migrate({
            copies: [
                { '@type': 'RollCopy', '@id': 'unnamed', keeper: { name: '', sameAs: [] } },
                { '@type': 'RollCopy', '@id': 'named', keeper: { name: 'Stanford', sameAs: [] } }
            ]
        })

        expect(migrated.copies[0]).not.toHaveProperty('keeper')
        expect(migrated.copies[1].keeper).toEqual({ name: 'Stanford', sameAs: [] })
    })
})
