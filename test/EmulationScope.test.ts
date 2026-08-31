import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation } from '../src/Emulation'

/**
 * The bass and the treble half of the keyboard follow separate stacks
 * of expression valves. Routing a perforation to the wrong stack, or to
 * neither, leaves a velocity curve flat, so emulating a real edition is
 * the check that the scopes still reach the right side.
 */
describe('emulating a version', () => {
    const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')
    const edition = importJsonLd(JSON.parse(file))
    const view = new EditionView(edition)

    const emulation = new Emulation()
    emulation.emulateVersion(edition.versions[0], view)

    const spread = (velocities: number[]) =>
        Math.max(...velocities) - Math.min(...velocities)

    it('shapes both halves of the keyboard', () => {
        expect(emulation.bassVelocities.length).toBeGreaterThan(1000)
        expect(emulation.trebleVelocities.length).toBeGreaterThan(1000)

        expect(spread(emulation.bassVelocities)).toBeGreaterThan(10)
        expect(spread(emulation.trebleVelocities)).toBeGreaterThan(10)
    })

    it('shapes them independently', () => {
        expect(emulation.bassVelocities).not.toEqual(emulation.trebleVelocities)
    })

    it('gives every note a velocity within the Welte range', () => {
        const noteOns = emulation.midiEvents.filter(event => event.type === 'noteOn')
        expect(noteOns.length).toBeGreaterThan(100)

        noteOns.forEach(event => {
            const velocity = (event as { velocity: number }).velocity
            expect(velocity).toBeGreaterThanOrEqual(emulation.options.welte_p)
            expect(velocity).toBeLessThanOrEqual(emulation.options.welte_f)
        })
    })
})
