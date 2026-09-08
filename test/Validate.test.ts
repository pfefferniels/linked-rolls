import { describe, expect, it } from 'vitest'
import * as path from 'path'
import { readFileSync } from 'fs'
import { importJsonLd } from '../src/importJsonLd'
import { asJsonLd } from '../src/asJsonLd'
import { validate } from '../src/validate'

const edition = () =>
    importJsonLd(JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')))

describe('Validate', () => {
    it('accepts an exported edition', () => {
        expect(validate(asJsonLd(edition()))).toBe(true)
        expect(validate.errors).toBeFalsy()
    })

    it('turns down a document in the old format and says where', () => {
        const document = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8'))
        expect(validate(document)).toBe(false)
        expect(validate.errors?.length).toBeGreaterThan(0)
        expect(validate.errors?.[0]).toHaveProperty('instancePath')
    })

    it('clears what it found once a document holds', () => {
        validate({})
        expect(validate.errors).toBeTruthy()
        validate(asJsonLd(edition()))
        expect(validate.errors).toBeFalsy()
    })
})
