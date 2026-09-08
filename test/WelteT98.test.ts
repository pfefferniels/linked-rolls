import { describe, expect, it } from 'vitest'
import { paperAt, paperSeconds, ROWS_PER_MM, WELTE_T98_SPOOL } from 'welte-mignon-emulator'
import { PUNCH_T98_MM } from 'welte-mignon-emulator/t98'
import { DynamicsCurve, NegotiatedEvent, PedalCurve, Performance, PerformedPedalEvent } from '../src/ReproducingSystem'
import { welteT98 } from '../src/systems/welteT98/bar'
import {
    defaultWelteT98Options,
    instrumentNameOf,
    instrumentNames,
    instrumentT98Of,
    labelOf,
    nuanceOf,
    pedalPresetOf,
    pedalPresets,
    secondsAt,
    welteT98System,
    WelteT98Options
} from '../src/systems/welteT98/system'
import { defaultWelteT100Options, welteT100System } from '../src/systems/welteT100/system'
import { welteT100 } from '../src/systems/welteT100/bar'
import { mm, track } from '../src/Quantity'

/**
 * A green roll written by hand. No edition of a T-98 roll is to hand, so the
 * events are built here rather than imported: the point of these tests is the
 * mechanism and the mapping onto it, and both are exercised by a code that
 * covers every track the bar reads.
 */
let nextId = 0
const at = (fromMm: number, toMm: number, trackNumber: number) => ({
    id: `symbol-${nextId++}`,
    horizontal: { from: mm(fromMm), to: mm(toMm) },
    vertical: { from: track(trackNumber), to: track(trackNumber) }
})

const expression = (type: string, fromMm: number, lengthMm: number, trackNumber: number): NegotiatedEvent => ({
    type: 'expression',
    expressionType: type,
    scope: trackNumber <= 5 ? 'bass' : 'treble',
    ...at(fromMm, fromMm + lengthMm, trackNumber)
})

const note = (pitch: number, fromMm: number, lengthMm: number): NegotiatedEvent => ({
    type: 'note',
    pitch,
    ...at(fromMm, fromMm + lengthMm, pitch - 21 + 6)
})

/** Notes every 12 mm across both halves, so that both stacks are heard. */
const notes = (count: number, fromMm = 60): NegotiatedEvent[] =>
    Array.from({ length: count }, (_, index) =>
        note(index % 2 === 0 ? 45 : 80, fromMm + index * 12, 10))

const GREEN: NegotiatedEvent[] = [
    ...notes(60),
    expression('Crescendo', 60, 180, 4),
    expression('SforzandoForte', 300, PUNCH_T98_MM, 5),
    expression('SforzandoForte', 330, PUNCH_T98_MM, 5),
    expression('Mezzoforte', 400, 120, 2),
    expression('SforzandoPiano', 560, 6, 1),
    expression('SustainPedal', 100, 300, 3),
    expression('Crescendo', 80, 320, 95),
    expression('SforzandoForte', 420, 8, 94),
    expression('SoftPedal', 200, 260, 96),
    expression('Mezzoforte', 500, 60, 97),
    expression('SforzandoPiano', 620, 6, 98)
]

const performed = (options: Partial<WelteT98Options> = {}, events = GREEN): Performance =>
    welteT98System.perform(events, { ...defaultWelteT98Options, ...options }, {})

const dynamics = (performance: Performance, name: string) =>
    performance.curves.find((curve): curve is DynamicsCurve => curve.kind === 'dynamics' && curve.name === name)!
const pedal = (performance: Performance, name: string) =>
    performance.curves.find((curve): curve is PedalCurve => curve.kind === 'pedal' && curve.name === name)!

const spread = (values: Float64Array) =>
    values.reduce((most, value) => Math.max(most, value), -Infinity)
    - values.reduce((least, value) => Math.min(least, value), Infinity)

const green = performed()

describe('the time axis', () => {
    it('is the take-up spool', () => {
        expect(welteT98System.defaultOptions.spool).toEqual(WELTE_T98_SPOOL)
        expect(secondsAt(WELTE_T98_SPOOL, mm(1450))).toEqual(paperSeconds(WELTE_T98_SPOOL, 145))
    })

    it('runs the paper faster as the spool fills', () => {
        const early = secondsAt(WELTE_T98_SPOOL, mm(100)) - secondsAt(WELTE_T98_SPOOL, mm(0))
        const late = secondsAt(WELTE_T98_SPOOL, mm(5100)) - secondsAt(WELTE_T98_SPOOL, mm(5000))
        expect(late).toBeLessThan(early)
    })

    it('can be walked back from time to place', () => {
        expect(paperAt(WELTE_T98_SPOOL, secondsAt(WELTE_T98_SPOOL, mm(120)))).toBeCloseTo(12, 9)
    })

    it('starts near the Deutsches Museum figure of 220 cm/min', () => {
        // No source states a T-98 spool geometry; the revolution is set to make
        // the initial paper speed this and it is better varied than trusted.
        const perSecond = 10 / secondsAt(WELTE_T98_SPOOL, mm(100))
        expect(perSecond * 60).toBeCloseTo(220, 0)
    })
})

describe('the dynamics of a green roll', () => {
    it('shapes both halves of the keyboard', () => {
        expect(dynamics(green, 'bass').travel.length).toBeGreaterThan(1000)
        expect(dynamics(green, 'treble').travel.length).toBeGreaterThan(1000)
        expect(spread(dynamics(green, 'bass').travel)).toBeGreaterThan(0.2)
        expect(spread(dynamics(green, 'treble').travel)).toBeGreaterThan(0.2)
    })

    it('shapes them independently', () => {
        expect(dynamics(green, 'bass').travel).not.toEqual(dynamics(green, 'treble').travel)
    })

    it('keeps the bellows between its rails', () => {
        for (const curve of [dynamics(green, 'bass'), dynamics(green, 'treble')]) {
            curve.travel.forEach(value => {
                expect(value).toBeGreaterThanOrEqual(-1e-9)
                expect(value).toBeLessThanOrEqual(1 + 1e-9)
            })
        }
    })

    it('is deterministic', () => {
        const again = performed()
        expect([...dynamics(again, 'bass').travel]).toEqual([...dynamics(green, 'bass').travel])
        expect([...dynamics(again, 'treble').travel]).toEqual([...dynamics(green, 'treble').travel])
    })

    it('does nothing at all for a perforation of zero length', () => {
        const withZero = performed({}, [...GREEN, expression('Crescendo', 700, 0, 4)])
        expect([...dynamics(withZero, 'bass').travel]).toEqual([...dynamics(green, 'bass').travel])
    })

    it('moves further under a longer perforation', () => {
        // The whole of the T-98's coding: the function lasts exactly as long as
        // the perforation runs over the glide block, so duration is the only
        // control the paper has.
        const reached = (lengthMm: number) => {
            const one = performed({}, [...notes(20), expression('Crescendo', 60, lengthMm, 4)])
            return dynamics(one, 'bass').travel[Math.round(120 * ROWS_PER_MM)]
        }
        expect(reached(40)).toBeGreaterThan(0)
        expect(reached(80)).toBeGreaterThan(reached(40) + 0.05)
    })

    it('lets the decrescendo take over by itself', () => {
        // Nothing switches it on: bore 100 and the vented conduit 39 are never
        // switched off, so the moment a commanded path closes the bellows opens.
        const one = performed({}, [...notes(20), expression('SforzandoForte', 60, 12, 5)])
        const travel = dynamics(one, 'bass').travel
        const peak = travel.reduce((most, value, index) => (value > travel[most] ? index : most), 0)
        expect(travel[peak]).toBeGreaterThan(0.3)
        expect(travel[travel.length - 1]).toBeLessThan(0.01)
    })

    it('names the instrument every curve was produced with', () => {
        // A comparison plot must not be able to put a curve fitted to a green
        // roll's drawn line beside one fitted to a red copy's curve without
        // saying which is which; their difference is the point of the comparison.
        expect(dynamics(green, 'bass').instrument).toContain('unfitted starting values')
        expect(dynamics(green, 'bass').instrument).toContain('T-98')
        expect(labelOf({ genuine: '184' })).toContain('genuine')
        expect(labelOf({ derived: '225' })).toContain('derived')
    })

    it('offers no fitted instrument yet, and says which set is in use', () => {
        expect(instrumentNames).toEqual([{ unfitted: 'starting-values' }])
        expect(instrumentNameOf(defaultWelteT98Options.nuance)).toEqual({ unfitted: 'starting-values' })
        const { nuance } = defaultWelteT98Options
        expect(instrumentNameOf({ ...nuance, bass: { ...nuance.bass, alpha: 0 } })).toBeUndefined()
    })

    it('attributes every performed event to the symbol it performs', () => {
        // `Emulation.findEventsPerforming` looks events up by the id of their
        // symbol, so an event that performs nothing is invisible to the desk.
        const ids = new Set(GREEN.map(event => event.id))
        expect(green.events.length).toBeGreaterThan(100)
        green.events.forEach(event => expect(ids.has(event.performs.id)).toBe(true))
        expect(new Set(green.events.map(event => event.performs.id)).size).toBeGreaterThan(50)
    })

    it('gives every note a velocity within the map', () => {
        const noteOns = green.events.filter(event => event.type === 'noteOn')
        expect(noteOns.length).toBeGreaterThan(20)
        const { piano, forte } = defaultWelteT98Options.velocity
        noteOns.forEach(event => {
            expect((event as { velocity: number }).velocity).toBeGreaterThanOrEqual(piano)
            expect((event as { velocity: number }).velocity).toBeLessThanOrEqual(forte)
        })
        expect(spread(Float64Array.from(noteOns, event => (event as { velocity: number }).velocity))).toBeGreaterThan(5)
    })
})

describe('the chain punching', () => {
    it('reads a chain of punches as the one hold an edition delivers', () => {
        // A held command on green paper is a chain of 1.594 mm holes at 2.62 mm
        // centres with structural paper bridges, not one slot. Merging them at one
        // tracker bore and a margin is what makes a raw scan and an edition of the
        // same command see the same port.
        const pitch = 2.62
        const chain = Array.from({ length: 23 }, (_, index) =>
            expression('Crescendo', 60 + index * pitch, PUNCH_T98_MM, 4))
        const slot = [...notes(20), expression('Crescendo', 60, 22 * pitch + PUNCH_T98_MM, 4)]

        const asChain = dynamics(performed({}, [...notes(20), ...chain]), 'bass').travel
        const asSlot = dynamics(performed({}, slot), 'bass').travel
        const worst = asSlot.reduce((most, value, index) => Math.max(most, Math.abs(value - asChain[index])), 0)
        expect(worst).toBeLessThan(0.02)
    })
})

describe('the pedals', () => {
    it('puts the sustain on the bass edge and the soft pedal on the treble', () => {
        // The T-100's arrangement mirrored, and the error a T-98 system is most
        // likely to make: Welte's Betriebsanleitung pp. 15 f. has the Fortepedal
        // on the third opening from the left and the Pianopedal on the third
        // from the right.
        const sustain = performed({}, [...notes(20), expression('SustainPedal', 60, 200, 3)])
        expect(Math.max(...pedal(sustain, 'damper').travel)).toBeGreaterThan(0.99)
        expect(Math.max(...pedal(sustain, 'hammerRail').travel)).toBe(0)

        const soft = performed({}, [...notes(20), expression('SoftPedal', 60, 200, 96)])
        expect(Math.max(...pedal(soft, 'hammerRail').travel)).toBeGreaterThan(0.99)
        expect(Math.max(...pedal(soft, 'damper').travel)).toBe(0)
    })

    it('holds each pedal for the length of its own perforation', () => {
        const { travel } = pedal(green, 'damper')
        expect(Math.max(...travel)).toBeGreaterThan(0.99)
        expect(travel[travel.length - 1]).toBeLessThan(0.01)
        expect(travel.filter(value => value > 0.1 && value < 0.9).length).toBeGreaterThan(20)
    })

    it('names the reading of the mechanism the constants belong to', () => {
        expect(pedalPresetOf(defaultWelteT98Options.pedals)).toEqual('damping')
        expect(pedalPresetOf(pedalPresets.brushing)).toEqual('brushing')
        expect(pedalPresetOf({ ...pedalPresets.brushing, fallMs: 1 })).toBeUndefined()
    })

    it('emits a run of controller steps and attributes each to a perforation', () => {
        const steps = green.events.filter((event): event is PerformedPedalEvent => event.type === 'damper')
        expect(steps.length).toBeGreaterThan(20)
        const pedals = new Set(GREEN.filter(event =>
            event.type === 'expression' && event.expressionType === 'SustainPedal').map(event => event.id))
        steps.forEach(step => {
            expect(step.value).toBeGreaterThanOrEqual(0)
            expect(step.value).toBeLessThanOrEqual(127)
            expect(pedals.has(step.performs.id)).toBe(true)
        })
    })
})

describe('the rewind', () => {
    it('ends the performance at a long bass sforzando-piano perforation', () => {
        // Skala-Rolle §10: the rewind runs on the first hole from the left, which
        // normally serves the forzando-piano; the Abstellbalg has considerable
        // dead motion so that the short musical perforations are lost in it.
        const long = performed({}, [...notes(60), expression('SforzandoPiano', 400, 400, 1)])
        const last = long.events.reduce((latest, event) => Math.max(latest, event.at), 0)
        const whole = performed({}, notes(60))
        const wholeLast = whole.events.reduce((latest, event) => Math.max(latest, event.at), 0)
        expect(last).toBeLessThan(wholeLast)
        expect(dynamics(long, 'bass').travel.length).toBeLessThan(dynamics(whole, 'bass').travel.length)
    })

    it('lets a short one through, and it still acts as a sforzando-piano', () => {
        const short = performed({}, [...notes(60), expression('SforzandoPiano', 400, 4, 1)])
        const whole = performed({}, notes(60))
        expect(short.events.length).toEqual(whole.events.length)

        const closing = [...notes(60), expression('Crescendo', 60, 300, 4)]
        const withCancel = performed({}, [...closing, expression('SforzandoPiano', 380, 4, 1)])
        const without = performed({}, closing)
        const row = Math.round(390 * ROWS_PER_MM)
        expect(dynamics(without, 'bass').travel[row]).toBeGreaterThan(0.1)
        expect(dynamics(withCancel, 'bass').travel[row])
            .toBeLessThan(dynamics(without, 'bass').travel[row])
    })

    it('carries on when the rewind is ignored', () => {
        const long = [...notes(60), expression('SforzandoPiano', 400, 400, 1)]
        const stopping = performed({ rewind: 'stop' }, long)
        const ignoring = performed({ rewind: 'ignore' }, long)
        expect(ignoring.events.length).toBeGreaterThan(stopping.events.length)
    })
})

describe('the common unit both systems are in', () => {
    it('means the same thing on the T-98 as on the T-100', () => {
        // Both scales carry the same ruled band — five rails, P.P. M.F. F.F. M.F.
        // P.P., 20.0 mm apart on red 3309 and on green Welte 184 alike — so a red
        // curve and a green curve are in one unit on Welte's authority. Both rest
        // at 0 with nothing punched and both reach 1 at the closed rail.
        const quiet = performed({}, notes(20))
        expect(Math.max(...dynamics(quiet, 'bass').travel)).toBe(0)

        const red = welteT100System.perform(
            [note(45, 60, 10), {
                type: 'expression', expressionType: 'SlowCrescendoOn', scope: 'bass',
                ...at(60, 62, 4)
            }],
            defaultWelteT100Options,
            {}
        )
        const redQuiet = welteT100System.perform([note(45, 60, 10)], defaultWelteT100Options, {})
        expect(Math.max(...(redQuiet.curves[0] as DynamicsCurve).travel)).toBeCloseTo(0, 9)
        expect(Math.max(...(red.curves[0] as DynamicsCurve).travel)).toBeGreaterThan(0)

        const loud = performed({}, [...notes(20), expression('SforzandoForte', 60, 60, 5)])
        expect(Math.max(...dynamics(loud, 'bass').travel)).toBeCloseTo(1, 6)
    })

    it('uses one velocity map for both systems', () => {
        // A comparison run with two maps measures the maps.
        expect(defaultWelteT98Options.velocity).toEqual(defaultWelteT100Options.velocity)
    })

    it('does not assume the two hooks are in the same place', () => {
        // No measurement of the T-98's hook exists on either scale, and the T-100's
        // 0.77 is a fraction of a drawn span while the green prior of 0.45 is a
        // weak one taken from what two programs assume by construction. Where each
        // sits is what a fit against a drawn green line will be the first to say.
        expect(defaultWelteT98Options.nuance.bass.mezzoforte)
            .not.toEqual(defaultWelteT100Options.nuance.bass.mezzoforte)
        expect(nuanceOf(instrumentT98Of({ unfitted: 'starting-values' })!)).toEqual(defaultWelteT98Options.nuance)
    })
})

describe('the tracker bar', () => {
    it('divides the keyboard between f sharp and g', () => {
        // Welte, Betriebsanleitung p. 7, corroborated by PlaySK's independent
        // green configuration, whose last bass note is MIDI 66.
        expect(defaultWelteT98Options.division).toEqual(track(52))
        expect(welteT98.meaningOf(track(52))).toEqual({ type: 'note', pitch: 67 })
        expect(welteT98.meaningOf(track(51))).toEqual({ type: 'note', pitch: 66 })
    })

    it('states the paper speed the literature gives', () => {
        expect(welteT98.paperSpeed).toEqual({ value: 2.2, unit: 'm/min' })
        expect(welteT100.paperSpeed).toEqual({ value: 3, unit: 'm/min' })
    })

    it('drives the rewind from the bass sforzando-piano position', () => {
        expect(welteT98.rewindTrack).toEqual(track(1))
        expect(welteT98.meaningOf(track(1))).toEqual({
            type: 'expression', expressionType: 'SforzandoPiano', scope: 'bass'
        })
    })
})
