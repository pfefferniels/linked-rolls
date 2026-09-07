import { describe, expect, it } from 'vitest'
import { trackerBarOf, trackerBars } from '../src/systems'
import { systemOf } from '../src/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { feetPerMinute, inMetersPerMinute, metersPerMinute } from '../src/Quantity'

describe('the systems the library knows', () => {
    it('lists the T-100 first', () => {
        expect(trackerBars[0]).toBe(welteT100)
        expect(trackerBars).toContain(welteLicensee)
    })

    it('finds a bar by the concept of its system', () => {
        expect(trackerBarOf(systemOf(welteLicensee))).toBe(welteLicensee)
        expect(trackerBarOf({ id: 'https://w3id.org/reo/type/system/welte-t100', name: '', sameAs: [] })).toBe(welteT100)
        expect(trackerBarOf({ name: 'unknown', sameAs: [] })).toBeUndefined()
        expect(trackerBarOf(undefined)).toBeUndefined()
    })
})

describe('a paper speed', () => {
    it('reads in metres per minute whichever unit it was stated in', () => {
        expect(inMetersPerMinute({ value: feetPerMinute(10), unit: 'ft/min' })).toBeCloseTo(3.048, 9)
        expect(inMetersPerMinute({ value: metersPerMinute(3), unit: 'm/min' })).toBe(3)
    })
})
