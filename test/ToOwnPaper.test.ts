import { describe, expect, it } from 'vitest'
import { DynamicsCurve, EmulatedCurve, NegotiatedEvent, RollProperties } from '../src/systems/ReproducingSystem'
import { defaultWelteT100Options, welteT100System } from '../src/systems/welteT100/system'
import { defaultWelteT98Options, welteT98System } from '../src/systems/welteT98/system'
import { mm, track } from '../src/model/Quantity'

let nextId = 0
const expression = (type: string, scope: 'bass' | 'treble', fromMm: number, lengthMm: number, trackNumber: number): NegotiatedEvent => ({
    type: 'expression',
    expressionType: type,
    scope,
    id: `symbol-${nextId++}`,
    horizontal: { from: mm(fromMm), to: mm(fromMm + lengthMm) },
    vertical: { from: track(trackNumber), to: track(trackNumber) }
})

const note = (pitch: number, fromMm: number, lengthMm: number, trackNumber: number): NegotiatedEvent => ({
    type: 'note',
    pitch,
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

    /** The seconds of the first sample of a curve at or past a place. */
    const secondsOfCurveAt = (curve: EmulatedCurve, place: number): number =>
        curve.seconds[curve.place.findIndex(value => value >= place)]!

    it('sounds a note on the clock its pedal runs on', () => {
        // A pedal caught at the same place as a note has to go down with it,
        // whatever paper the version was cut on.
        const pedalled: readonly NegotiatedEvent[] = [
            expression('SustainPedalOn', 'treble', 2000, 3, 93),
            note(60, 2000, 20, 47),
            expression('SustainPedalOff', 'treble', 2400, 3, 94)
        ]
        const { events, curves } = welteT100System.perform(pedalled, defaultWelteT100Options, { toOwnPaper: 0.77 })
        const damper = curves.find(curve => curve.name === 'damper')!
        const noteOn = events.find(event => event.type === 'noteOn')!
        const pedalDown = events.find(event => event.type === 'damper')!

        expect(noteOn.at).toBeCloseTo(secondsOfCurveAt(damper, 2000), 2)
        expect(Math.abs(pedalDown.at - noteOn.at)).toBeLessThan(0.5)
    })

    it('keeps the notes of a shorter paper up to its end', () => {
        const notes = [note(60, 200, 20, 59), note(62, 5000, 20, 61)]
        const played = welteT98System.perform(notes, defaultWelteT98Options, { toOwnPaper: 0.775 }).events
            .filter(event => event.type === 'noteOn')
        expect(played).toHaveLength(2)
    })
})
