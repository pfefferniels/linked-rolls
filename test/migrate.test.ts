import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { readFileSync } from 'fs'
import * as path from 'path'
import { migrate } from '../src/migrate'
import { importJsonLd } from '../src/importJsonLd'
import { asJsonLd } from '../src/asJsonLd'
import { CollationTolerance } from '../src/Collation'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { collateSymbols } from '../src/editionOps'
import { idsOf } from '../src/Assumption'
import { Note } from '../src/Symbol'
import { mm } from '../src/Quantity'
import { copy, editionOf, hole, note, version } from './editionFixture'

const edition01 = () =>
    JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8'))

/** Two copies putting one note 2 mm apart, in a version and one based on it. */
const twoCopiesApart = (): Edition => editionOf(
    [
        copy('first', [hole('hole-note', 1000, 1010, 47)]),
        copy('second', [hole('hole-note-second', 1002, 1011, 47)])
    ],
    [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'hole-note')] }]),
        version('B', [{ type: 'edit', id: 'edit-b', insert: [note('note-b', 60, 'hole-note-second')] }], 'A')
    ]
)

/** That edition as a release before the move wrote it: the tolerance stated once, on the edition. */
const writtenBefore = (tolerance: CollationTolerance) => {
    const edition = twoCopiesApart()
    edition.creation.collationTolerance = tolerance
    return JSON.parse(JSON.stringify(asJsonLd(edition)))
}

const carriersOfNote = (edition: Edition) => idsOf(new EditionView(edition).get<Note>('note')!.carriers)

describe('migrating a 0.1 edition', () => {
    it('gives versions and conditions their typology keys', () => {
        const migrated = migrate(edition01())
        expect(migrated.versions.length).toBeGreaterThan(0)
        migrated.versions.forEach((version: any) => {
            expect(version['@type']).toEqual('Version')
            expect(['edition', 'unicum']).toContain(version.versionType)
        })

        const conditions = migrated.copies.flatMap((copy: any) => copy.conditions)
        expect(conditions.length).toBeGreaterThan(0)
        conditions.forEach((condition: any) => {
            expect(condition['@type']).toEqual('ConditionState')
            expect(condition.conditionType).toBeTruthy()
        })
    })

    it('turns the keeper and the production metadata into nodes', () => {
        const migrated = migrate(edition01())
        migrated.copies.forEach((copy: any) => {
            expect(copy).not.toHaveProperty('location')
            expect(copy.keeper).toEqual({ name: expect.any(String), sameAs: [] })
            expect(copy.production.system).toMatchObject({
                '@id': 'https://w3id.org/reo/type/system/welte-t100'
            })
        })
        const [stated, ...unstated] = migrated.copies.map((copy: any) => copy.production)
        expect(stated.company).toEqual({ name: 'M. Welte & Söhne', sameAs: [] })
        expect(stated.paper).toEqual({ name: 'red-lined', sameAs: [] })
        unstated.forEach((production: any) => {
            expect(production).not.toHaveProperty('company')
            expect(production).not.toHaveProperty('paper')
        })
    })

    it('moves the system off the roll and onto every version and copy', () => {
        const migrated = migrate(edition01())
        expect(migrated.roll).not.toHaveProperty('system')

        const t100 = { '@id': 'https://w3id.org/reo/type/system/welte-t100', sameAs: [] }
        migrated.versions.forEach((version: any) => expect(version.system).toMatchObject(t100))
        migrated.copies.forEach((copy: any) => expect(copy.production.system).toMatchObject(t100))
    })

    /**
     * A copy cut for another system had its holes put onto the roll's
     * bar as it was read, so they go back onto its own. Between the
     * Licensee and the T-100 that is two tracks in the note block.
     */
    it('puts a copy cut for another system back onto its own bar', () => {
        const migrated = migrate({
            roll: {
                system: { '@id': 'https://w3id.org/reo/type/system/welte-t100', name: '', sameAs: [] }
            },
            versions: [],
            copies: [{
                production: {
                    system: { '@id': 'https://w3id.org/reo/type/system/welte-licensee', name: '', sameAs: [] }
                },
                features: [
                    { '@type': 'Hole', vertical: { unit: 'track', from: 47 } },
                    { '@type': 'Hole', vertical: { unit: 'track', from: 93 } },
                    { '@type': 'Hole', vertical: { unit: 'track', from: 9 } }
                ]
            }]
        })

        expect(migrated.copies[0].features.map((feature: any) => feature.vertical.from))
            .toEqual([45, 91])
    })

    it("leaves the features of a copy of the roll's own system alone", () => {
        const features = [{ '@type': 'Hole', vertical: { unit: 'track', from: 47 } }]
        const migrated = migrate({
            roll: { system: { '@id': 'https://w3id.org/reo/type/system/welte-t100', name: '', sameAs: [] } },
            versions: [],
            copies: [{ features }]
        })

        expect(migrated.copies[0].features.map((feature: any) => feature.vertical.from)).toEqual([47])
    })

    it('rewrites references written as values and keys renamed since', () => {
        const migrated = migrate({
            versions: [{
                '@type': 'edition',
                edits: [{
                    '@type': 'edit',
                    classification: 'shift',
                    insert: [{ '@type': 'expression', alignedWith: { '@value': 'x', '@annotation': { note: 'n' } } }]
                }]
            }],
            copies: [{ productionEvent: { company: 'M. Welte & Söhne', paper: '' }, features: [{ annotates: 'iiif' }] }]
        })
        const edit = migrated.versions[0].edits[0]
        expect(edit).not.toHaveProperty('classification')
        expect(edit.editType).toEqual('shift')
        expect(edit.insert[0].alignedWith).toEqual({ '@id': 'x', '@annotation': { note: 'n' } })

        const copy = migrated.copies[0]
        expect(copy.production).toEqual({ company: { name: 'M. Welte & Söhne', sameAs: [] } })
        expect(copy.features[0]).toEqual({ depiction: 'iiif' })
    })

    it('leaves a current edition unchanged', () => {
        const once = migrate(edition01())
        expect(migrate(once)).toEqual(once)
    })

    it('records the scale of an aligned copy beside its paper-stretch condition', () => {
        const migrated = migrate({
            copies: [{
                ops: ['shifted', 'stretched'],
                measurements: { shift: { horizontal: 1, vertical: 0 } },
                conditions: [{ '@type': 'paper-stretch', factor: 1.02 }]
            }, {
                ops: [],
                measurements: {},
                conditions: []
            }]
        })
        expect(migrated.copies[0].measurements).toEqual({ shift: { horizontal: 1, vertical: 0 }, scale: 1.02 })
        expect(migrated.copies[0].conditions[0]).toMatchObject({ '@type': 'ConditionState', conditionType: 'paper-stretch', factor: 1.02 })
        expect(migrated.copies[1].measurements).toEqual({})
    })

    it('imports a 0.1 edition as the current model', () => {
        const imported = importJsonLd(edition01())
        expect(imported.versions[0]).toMatchObject({ type: 'Version', versionType: 'edition' })
        expect(imported.versions[0].system.id).toEqual('https://w3id.org/reo/type/system/welte-t100')
        expect(imported.copies[0].keeper).toEqual({ name: 'Stanford', sameAs: [] })
    })
})

describe('migrating an edition whose collation tolerance was the edition\'s', () => {
    it('states it on every derivation that gives none of its own', () => {
        const migrated = migrate({
            creation: { collationTolerance: { toleranceStart: 2, toleranceEnd: 2 } },
            versions: [
                { '@id': 'A' },
                { '@id': 'B', basedOn: { '@id': 'A' } },
                { '@id': 'C', basedOn: { '@id': 'A', collationTolerance: { toleranceStart: 7, toleranceEnd: 7 } } }
            ]
        })
        expect(migrated.versions[0]).not.toHaveProperty('basedOn')
        expect(migrated.versions[1].basedOn).toEqual({ '@id': 'A', collationTolerance: { toleranceStart: 2, toleranceEnd: 2 } })
        expect(migrated.versions[2].basedOn.collationTolerance).toEqual({ toleranceStart: 7, toleranceEnd: 7 })
    })

    it('leaves the derivations of an edition that stated no tolerance as they are', () => {
        const migrated = migrate({ creation: {}, versions: [{ '@id': 'B', basedOn: { '@id': 'A' } }] })
        expect(migrated.versions[0].basedOn).toEqual({ '@id': 'A' })
    })

    it('keeps a version collating at the tolerance the edition stated', () => {
        const tight = importJsonLd(writtenBefore({ toleranceStart: mm(1), toleranceEnd: mm(1) }))
        expect(tight.versions[1].basedOn!.collationTolerance).toEqual({ toleranceStart: 1, toleranceEnd: 1 })
        expect(produce(tight, collateSymbols(new EditionView(tight), 'B', ['note-b']))).toBe(tight)

        const wide = importJsonLd(writtenBefore({ toleranceStart: mm(5), toleranceEnd: mm(5) }))
        const collated = produce(wide, collateSymbols(new EditionView(wide), 'B', ['note-b']))
        expect(carriersOfNote(collated)).toEqual(['hole-note', 'hole-note-second'])
    })
})

describe('migrating a document that is not an edition', () => {
    /**
     * A document is migrated before it is validated, so a malformed one
     * reaches these steps and must come out of them rather than throw:
     * the schema is what turns it down, and it needs the document back
     * to say why.
     */
    it('passes a document whose versions and copies are not lists through', () => {
        const odd = { roll: { catalogueNumber: 'WM 225' }, versions: 'many', copies: 7 }
        expect(() => migrate(odd)).not.toThrow()
        expect(migrate(odd)).toMatchObject({ versions: 'many', copies: 7 })
    })

    it('leaves a copy that is not an object alone', () => {
        const odd = {
            roll: { system: { '@id': 'https://w3id.org/reo/type/system/welte-t100', name: '', sameAs: [] } },
            versions: [],
            copies: [null, 'a copy']
        }
        expect(() => migrate(odd)).not.toThrow()
        expect(migrate(odd).copies).toEqual([null, 'a copy'])
    })
})
