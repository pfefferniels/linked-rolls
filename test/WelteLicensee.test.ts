import { describe, expect, it } from 'vitest'
import { DynamicsCurve, NegotiatedEvent, Performance } from '../src/ReproducingSystem'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import {
    defaultWelteLicenseeOptions,
    instrumentNames,
    welteLicenseeSystem
} from '../src/systems/welteLicensee/system'
import { defaultWelteT100Options, welteT100System } from '../src/systems/welteT100/system'
import { mm, track } from '../src/Quantity'

let nextId = 0
const at = (fromMm: number, toMm: number, trackNumber: number) => ({
    id: `symbol-${nextId++}`,
    horizontal: { from: mm(fromMm), to: mm(toMm) },
    vertical: { from: track(trackNumber), to: track(trackNumber) }
})

const expression = (type: string, fromMm: number, lengthMm: number, trackNumber: number): NegotiatedEvent => ({
    type: 'expression',
    expressionType: type,
    scope: trackNumber <= 8 ? 'bass' : 'treble',
    ...at(fromMm, fromMm + lengthMm, trackNumber)
})

/** A crescendo held on both halves, long enough for the bellows to travel. */
const events: readonly NegotiatedEvent[] = [
    expression('SlowCrescendoOn', 100, 5, 4),
    expression('SlowCrescendoOff', 800, 5, 3),
    expression('SlowCrescendoOn', 100, 5, 95),
    expression('SlowCrescendoOff', 800, 5, 96)
]

const perform = (): Performance =>
    welteLicenseeSystem.perform(events, defaultWelteLicenseeOptions, {})

const dynamics = (name: string): DynamicsCurve =>
    perform().curves.find(curve => curve.kind === 'dynamics' && curve.name === name) as DynamicsCurve

describe('the Licensee system', () => {
    it('reads the T-100 vocabulary off its own bar', () => {
        expect(welteLicenseeSystem.trackerBar).toBe(welteLicensee)
        expect(welteLicensee.meaningOf(track(95))).toEqual({
            type: 'expression',
            expressionType: 'SlowCrescendoOn',
            scope: 'treble'
        })
    })

    it('divides the keyboard two tracks lower than the T-100, the motor tracks being absent', () => {
        expect(defaultWelteLicenseeOptions.division).toBe(track(52))
        expect(defaultWelteT100Options.division).toBe(track(54))
    })

    it('offers one instrument, and it is unfitted', () => {
        expect(instrumentNames).toEqual([{ unfitted: 'welte-t100-consensus' }])
    })

    it('says on every curve that it is running on T-100 constants', () => {
        for (const half of ['bass', 'treble']) {
            expect(dynamics(half).instrument).toBe(
                'Welte-Mignon (Licensee), unfitted — Welte-Mignon T-100 consensus'
            )
        }
    })

    it('never passes off a Licensee playback as a T-100 one', () => {
        const red = welteT100System.perform(events, defaultWelteT100Options, {})
        const redCurve = red.curves.find(curve => curve.kind === 'dynamics') as DynamicsCurve
        expect(redCurve.instrument).toBe('Welte-Mignon T-100, consensus')
        expect(dynamics('bass').instrument).not.toBe(redCurve.instrument)
    })

    it('plays the same mechanism, so the same code moves the bellows the same way', () => {
        const licensee = dynamics('bass').travel
        const red = (welteT100System
            .perform(events, defaultWelteT100Options, {})
            .curves.find(curve => curve.kind === 'dynamics' && curve.name === 'bass') as DynamicsCurve).travel
        expect(licensee.length).toBe(red.length)
        expect(licensee.at(-1)).toBeCloseTo(red.at(-1)!, 10)
    })
})
