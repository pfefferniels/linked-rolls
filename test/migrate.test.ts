import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { migrate } from '../src/migrate'
import { importJsonLd } from '../src/importJsonLd'

const edition01 = () =>
    JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8'))

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
            expect(copy.production).not.toHaveProperty('system')
        })
        const [stated, ...unstated] = migrated.copies.map((copy: any) => copy.production)
        expect(stated.company).toEqual({ name: 'M. Welte & Söhne', sameAs: [] })
        expect(stated.paper).toEqual({ name: 'red-lined', sameAs: [] })
        unstated.forEach((production: any) => {
            expect(production).not.toHaveProperty('company')
            expect(production).not.toHaveProperty('paper')
        })
    })

    it('names the T-100 as the system of the roll', () => {
        expect(migrate(edition01()).roll.system).toMatchObject({
            '@id': 'https://w3id.org/reo/type/system/welte-t100',
            sameAs: []
        })
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

    it('imports a 0.1 edition as the current model', () => {
        const imported = importJsonLd(edition01())
        expect(imported.versions[0]).toMatchObject({ type: 'Version', versionType: 'edition' })
        expect(imported.roll.system.id).toEqual('https://w3id.org/reo/type/system/welte-t100')
        expect(imported.copies[0].keeper).toEqual({ name: 'Stanford', sameAs: [] })
    })
})
