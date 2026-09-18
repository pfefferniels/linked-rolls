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

/**
 * That edition as a release before the move wrote it: the tolerance stated
 * once, on the edition, and a version naming its one derivation on its own.
 */
const writtenBefore = (tolerance: CollationTolerance) => {
    const edition = twoCopiesApart()
    edition.creation.collationTolerance = tolerance
    const written = JSON.parse(JSON.stringify(asJsonLd(edition)))
    return {
        ...written,
        versions: written.versions.map(({ basedOn, ...version }: any) =>
            basedOn ? { ...version, basedOn: basedOn[0] } : version)
    }
}

const carriersOfNote = (edition: Edition) => idsOf(new EditionView(edition).get<Note>('note')!.carriers)

/** Every feature of a migrated copy, whichever act states it, and whatever a patch bears. */
const featuresIn = (copy: any): any[] => {
    const borne = (feature: any): any[] => [feature, ...(feature.features ?? []).flatMap(borne)]
    return [copy.production ?? {}, ...(copy.modifications ?? [])]
        .flatMap((act: any) => [...(act.produced ?? []), ...(act.added ?? [])])
        .flatMap(borne)
}

describe('migrating a 0.1 edition', () => {
    it('types versions as versions and gives conditions their typology key', () => {
        const migrated = migrate(edition01())
        expect(migrated.versions.length).toBeGreaterThan(0)
        migrated.versions.forEach((version: any) => {
            expect(version['@type']).toEqual('Version')
            expect(version).not.toHaveProperty('versionType')
        })

        const conditions = migrated.copies.flatMap((copy: any) => copy.conditions)
        expect(conditions.length).toBeGreaterThan(0)
        conditions.forEach((condition: any) => {
            expect(condition['@type']).toEqual('ConditionState')
            expect(condition.conditionType).toBeTruthy()
        })
    })

    it('takes the label off a version and leaves a copy the siglum it is cited by', () => {
        const migrated = migrate(edition01())
        expect(migrated.versions.length).toBeGreaterThan(0)
        migrated.versions.forEach((version: any) => expect(version).not.toHaveProperty('siglum'))

        const copies = migrate({ copies: [{ '@type': 'RollCopy', '@id': 'first', siglum: 'St1' }] }).copies
        expect(copies[0].siglum).toEqual('St1')
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

    /**
     * The writing methods and the patch materials were the only
     * capitalised terms of the type vocabulary, and were lower-cased
     * with the vocabulary still a draft.
     */
    it('lower-cases the writing methods and the patch materials', () => {
        const features = migrate(edition01()).copies.flatMap(featuresIn)

        const stated = (key: string) => [...new Set(features.map((feature: any) => feature[key]).filter(Boolean))].sort()
        expect(stated('technique')).toEqual(['handwriting', 'print', 'stamp'])
        expect(stated('material')).toEqual(['paper'])
    })

    /**
     * How a trace was made and what it was made with stood under one
     * key before they were told apart.
     */
    it('sorts the terms of the one-time method between technique and medium', () => {
        const migrated = migrate({
            copies: [{
                '@type': 'RollCopy',
                features: [
                    { '@type': 'Writing', '@id': 'date', method: 'Handwriting' },
                    { '@type': 'Mark', '@id': 'circle', method: 'pencil' }
                ]
            }]
        })
        const [date, circle] = featuresIn(migrated.copies[0])
        expect(date).toEqual({ '@type': 'Writing', '@id': 'date', technique: 'handwriting' })
        expect(circle).toEqual({ '@type': 'Mark', '@id': 'circle', medium: 'pencil' })
    })

    it('lower-cases a term the copies in hand do not use', () => {
        const migrated = migrate({
            copies: [{ '@type': 'RollCopy', features: [{ '@type': 'GluedOn', '@id': 'tape', material: 'Tape' }] }]
        })
        expect(featuresIn(migrated.copies[0])[0].material).toEqual('tape')
    })

    it('leaves a current edition unchanged', () => {
        const once = migrate(edition01())
        expect(migrate(once)).toEqual(once)
    })

    /**
     * A copy held its features in one list and a modification named by
     * id what it had added. Each feature now stands in the act that
     * brought it about, and what no act names was punched.
     */
    it('puts every feature into the act that brought it about', () => {
        const copies = migrate(edition01()).copies
        copies.forEach((copy: any) => {
            expect(copy).not.toHaveProperty('features')
            expect(copy.production.produced.length).toBeGreaterThan(0)
            copy.modifications.forEach((act: any) =>
                expect(act['@type']).toBeOneOf(['Attachment', 'Alteration', 'Removal']))
        })

        const kinds = (act: any) => [...(act.produced ?? []), ...(act.added ?? [])].map((f: any) => f['@type'])
        expect(copies.flatMap((copy: any) => copy.modifications).map((act: any) => [act['@type'], kinds(act)]))
            .toEqual([
                ['Alteration', ['Writing']],
                // the one act that named two writings and two patches
                ['Alteration', ['Writing', 'Writing']],
                ['Attachment', ['GluedOn', 'GluedOn']],
                ['Alteration', new Array(8).fill('Hole')],
                ['Alteration', ['Writing']],
                ['Alteration', ['Writing']],
                // the repair on the third copy, which named nothing to begin with
                ['Alteration', []]
            ])
        expect(copies.flatMap(featuresIn).length).toEqual(edition01().copies.flatMap((copy: any) =>
            copy.features.flatMap((feature: any) => [feature, ...(feature.features ?? [])])).length)
    })

    it('splits an addition that named both a patch and a feature into two acts', () => {
        const feature = (type: string, id: string) => ({ '@type': type, '@id': id })
        const migrated = migrate({
            copies: [{
                '@type': 'RollCopy',
                features: [feature('GluedOn', 'patch'), feature('Writing', 'label'), feature('Hole', 'punched')],
                modifications: [{ '@type': 'Addition', purpose: 'labeling', added: ['patch', 'label'] }]
            }]
        })

        expect(migrated.copies[0].modifications).toEqual([
            { '@type': 'Alteration', purpose: 'labeling', produced: [feature('Writing', 'label')] },
            { '@type': 'Attachment', purpose: 'labeling', added: [feature('GluedOn', 'patch')] }
        ])
        expect(migrated.copies[0].production.produced).toEqual([feature('Hole', 'punched')])
    })

    it('keeps an addition that named nothing, as an act that produced nothing', () => {
        const migrated = migrate({
            copies: [{ '@type': 'RollCopy', features: [], modifications: [{ '@type': 'Addition', purpose: 'repair' }] }]
        })
        expect(migrated.copies[0].modifications).toEqual([{ '@type': 'Alteration', purpose: 'repair', produced: [] }])
    })

    it('names a feature a patch bears that the file left unnamed', () => {
        const migrated = migrate({
            copies: [{
                '@type': 'RollCopy',
                features: [{
                    '@type': 'GluedOn', '@id': 'patch', material: 'paper',
                    features: [{ '@type': 'Writing', technique: 'print' }]
                }],
                modifications: []
            }]
        })
        expect(featuresIn(migrated.copies[0])[1]).toMatchObject({ '@id': 'patch-1', '@type': 'Writing' })
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
        expect(imported.versions[0]).toMatchObject({ type: 'Version' })
        expect(imported.versions[0].system.id).toEqual('https://w3id.org/reo/type/system/welte-t100')
        expect(imported.copies[0].keeper).toEqual({ name: 'Stanford', sameAs: [] })
    })

    it('drops the type a version stated as an edition or a unicum', () => {
        const migrated = migrate({ versions: [{ '@type': 'Version', '@id': 'A', versionType: 'unicum' }] })
        expect(migrated.versions[0]).toMatchObject({ '@type': 'Version', '@id': 'A' })
        expect(migrated.versions[0]).not.toHaveProperty('versionType')
    })

    /**
     * A date was a value of its own, typed on the node, before it was the
     * time-span the event falls within. The datatype goes with it: each
     * bound is typed by the context now, and one left on the node would
     * read as a class.
     */
    it('reads a date written as a value as the day it falls within', () => {
        const date = migrate(edition01()).roll.recordingEvent.date
        expect(date).toMatchObject({ within: '1905-01-20' })
        expect(date).not.toHaveProperty('@value')
        expect(date).not.toHaveProperty('@type')
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
        expect(migrated.versions[1].basedOn).toEqual([{ '@id': 'A', collationTolerance: { toleranceStart: 2, toleranceEnd: 2 } }])
        expect(migrated.versions[2].basedOn[0].collationTolerance).toEqual({ toleranceStart: 7, toleranceEnd: 7 })
    })

    it('leaves the derivations of an edition that stated no tolerance as they are', () => {
        const migrated = migrate({ creation: {}, versions: [{ '@id': 'B', basedOn: { '@id': 'A' } }] })
        expect(migrated.versions[0].basedOn).toEqual([{ '@id': 'A' }])
    })

    it('keeps a version collating at the tolerance the edition stated', () => {
        const tight = importJsonLd(writtenBefore({ toleranceStart: mm(1), toleranceEnd: mm(1) }))
        expect(tight.versions[1].basedOn![0].collationTolerance).toEqual({ toleranceStart: 1, toleranceEnd: 1 })
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
