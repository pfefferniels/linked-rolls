import { describe, expect, it } from 'vitest'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { mm, track } from '../src/Quantity'

const at = (fromMm: number, toMm: number, trackNumber: number) => ({
    horizontal: { from: mm(fromMm), to: mm(toMm) },
    vertical: { from: track(trackNumber) }
})

describe('where a roll says it ends', () => {
    it('takes any perforation on a line the system keeps for the rewind', () => {
        const rewind = welteT100.rewindTrack
        expect(welteT100.endsAt([at(9000, 9005, rewind)])).toEqual({
            at: mm(9000),
            because: 'rewind'
        })
    })

    it('wants a long one where the rewind shares the sforzando-piano line', () => {
        const rewind = welteT98.rewindTrack
        // A commanded sforzando-piano runs a couple of millimetres.
        expect(welteT98.endsAt([at(4000, 4003, rewind)])).toBeUndefined()
        // The rewind chain on the Monteurscala is 103.8 mm.
        expect(welteT98.endsAt([at(9000, 9103.8, rewind)])).toEqual({
            at: mm(9000),
            because: 'rewind'
        })
    })

    it('reports nothing where the paper says nothing', () => {
        expect(welteT98.endsAt([])).toBeUndefined()
        expect(welteT100.endsAt([at(100, 105, track(30))])).toBeUndefined()
    })

    it('takes the first rewind, so a roll with two is cut at the earlier', () => {
        const rewind = welteT98.rewindTrack
        const end = welteT98.endsAt([
            at(9000, 9104, rewind),
            at(3000, 3104, rewind)
        ])
        expect(end?.at).toBe(mm(3000))
    })

    it('answers for the Licensee too, which keeps the T-100 rewind', () => {
        expect(welteLicensee.endsAt([at(8000, 8005, welteLicensee.rewindTrack)])?.because)
            .toBe('rewind')
    })

    it('reads a copy\'s holes as readily as a version\'s symbols', () => {
        // The signature asks only for a place and a position, so a reader can
        // put the question before there are any symbols to ask it of.
        const holes = [
            { horizontal: { from: mm(50), to: mm(52) }, vertical: { from: track(20) } },
            { horizontal: { from: mm(9700), to: mm(9804) }, vertical: { from: welteT98.rewindTrack } }
        ]
        expect(welteT98.endsAt(holes)?.at).toBe(mm(9700))
    })
})
