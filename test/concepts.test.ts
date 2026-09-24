import { describe, expect, it } from 'vitest'
import * as path from 'path'
import { readFileSync } from 'fs'
import { conceptOf, nameOf, vocabulary } from '../src/model/vocabulary'
import { procedures } from '../src/model/procedures'
import { welteT100 } from '../src/systems/welteT100/bar'
import { systemOf } from '../src/systems/TrackerBar'
import { importJsonLd } from '../src/io/importJsonLd'
import { asJsonLd } from '../src/io/asJsonLd'
import { validate } from '../src/validate'

/**
 * A concept the vocabulary declares is named by its IRI alone, so an
 * edition states no name for it and a reader looks one up.
 */

const edition = () =>
    importJsonLd(JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')))

const withRollSystem = (system: unknown) => {
    const exported = asJsonLd(edition()) as { versions?: { system?: unknown }[] }
    exported.versions?.forEach(version => { version.system = system })
    return exported
}

const t100 = systemOf(welteT100)
const procedure = procedures[0]!

describe('what a concept is called', () => {
    it('is the name it states', () => {
        expect(nameOf({ name: 'red-lined', sameAs: [] })).toBe('red-lined')
    })

    it('is read from the vocabulary where it states only an IRI', () => {
        expect(nameOf({ id: t100.id! })).toBe(t100.name)
        expect(nameOf({ id: procedure.id! })).toBe(procedure.name)
    })

    it('prefers what the edition states over the vocabulary', () => {
        expect(nameOf({ id: t100.id!, name: 'T-100' })).toBe('T-100')
    })

    it('falls back to the IRI where the vocabulary has no such concept', () => {
        expect(nameOf({ id: 'https://example.org/system/invented' }))
            .toBe('https://example.org/system/invented')
    })
})

describe('the concepts the vocabulary declares', () => {
    it('holds every system and every procedure', () => {
        expect(vocabulary.length).toBeGreaterThanOrEqual(procedures.length + 1)
        expect(conceptOf(t100.id)).toEqual(t100)
        expect(conceptOf(procedure.id)).toEqual(procedure)
    })

    it('finds nothing for an IRI it does not have', () => {
        expect(conceptOf('https://example.org/system/invented')).toBeUndefined()
        expect(conceptOf(undefined)).toBeUndefined()
    })
})

describe('what the schema makes of a concept', () => {
    it('accepts one that states its IRI alone', () => {
        expect(validate(withRollSystem({ '@id': t100.id }))).toBe(true)
    })

    it('accepts one that states a name and no IRI', () => {
        expect(validate(withRollSystem({ name: 'a system of its own', sameAs: [] }))).toBe(true)
    })

    it('turns down one that states neither', () => {
        expect(validate(withRollSystem({ sameAs: [] }))).toBe(false)
    })
})

describe('an edition that states no name for a declared concept', () => {
    it('survives a round trip, and gains no name on the way', () => {
        const document = withRollSystem({ '@id': t100.id })
        const again = asJsonLd(importJsonLd(document)) as { versions?: { system?: unknown }[] }
        expect(again.versions?.[0]?.system).toEqual({ '@id': t100.id })
    })
})
