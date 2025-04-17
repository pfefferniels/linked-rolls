import { describe, expect, it } from 'vitest'
import { Emulation } from '../src/Emulation';

describe('Emulation', () => {
    it('correctly converts between place and date', () => {
        const emulation = new Emulation()
        const place = 12
        const time = emulation.placeTimeConversion.placeToTime(place)
        const newPlace = emulation.placeTimeConversion.timeToPlace(time)
        expect(place).toEqual(Math.round(newPlace))
    })
})
