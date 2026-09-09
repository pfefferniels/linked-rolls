import { describe, expect, it } from 'vitest'
import { DynamicsCurve, NegotiatedEvent, RollProperties } from '../src/ReproducingSystem'
import { defaultWelteT100Options, welteT100System } from '../src/systems/welteT100/system'
import { defaultWelteT98Options, welteT98System } from '../src/systems/welteT98/system'
import { mm, track } from '../src/Quantity'

let nextId = 0
const expression = (type: string, scope: 'bass' | 'treble', fromMm: number, lengthMm: number, trackNumber: number): NegotiatedEvent => ({
    type: 'expression',
    expressionType: type,
    scope,
    id: `symbol-${nextId++}`,
    horizontal: { from: mm(fromMm), to: mm(fromMm + lengthMm) },
    vertical: { from: track(trackNumber), to: track(trackNumber) }
})

const red: readonly NegotiatedEvent[] = [
    expression('SlowCrescendoOn', 'bass', 200, 5, 5),
    expression('SlowCrescendoOff', 'bass', 900, 5, 4)
]

/** The same commands on a shorter paper, as a green re-cut of the same recording carries them. */
const green: readonly NegotiatedEvent[] = [
    expression('Crescendo', 'bass', 200, 700, 17),
    expression('Crescendo', 'treble', 200, 700, 112)
]

const dynamicsOf = (curves: readonly { kind: string, name: string }[], name: string) =>
    curves.find(curve => curve.kind === 'dynamics' && curve.name === name) as unknown as DynamicsCurve

const t100 = (roll: RollProperties) =>
    dynamicsOf(welteT100System.perform(red, defaultWelteT100Options, roll).curves, 'bass')

const t98 = (roll: RollProperties) =>
    dynamicsOf(welteT98System.perform(green, defaultWelteT98Options, roll).curves, 'bass')

describe('toOwnPaper', () => {
    it('defaults to the identity, so an edition that states none is unaffected', () => {
        expect(t100({}).seconds).toEqual(t100({ toOwnPaper: 1 }).seconds)
        expect(t98({}).seconds).toEqual(t98({ toOwnPaper: 1 }).seconds)
    })

    /** When the last commanded place reaches the bar, which is the quantity a reader compares. */
    const secondsAtPlace = (curve: DynamicsCurve, place: number): number =>
        curve.seconds[curve.place.findIndex(value => value >= place)]!

    it('brings a place to the bar in proportion to the paper it stands for', () => {
        expect(secondsAtPlace(t98({ toOwnPaper: 0.775 }), 900) / secondsAtPlace(t98({}), 900))
            .toBeCloseTo(0.775, 2)
    })

    it('reports the place axis the edition gave, not the paper', () => {
        // A green version's places stay red millimetres; only the time changes.
        expect(secondsAtPlace(t98({ toOwnPaper: 0.775 }), 900)).toBeLessThan(secondsAtPlace(t98({}), 900))
        expect(t98({ toOwnPaper: 0.775 }).place[0]).toBeCloseTo(t98({}).place[0]!, 9)
    })

    it('applies to the T-100 as well, since either system may be the derived one', () => {
        expect(secondsAtPlace(t100({ toOwnPaper: 0.775 }), 900) / secondsAtPlace(t100({}), 900))
            .toBeCloseTo(0.775, 2)
    })
})
