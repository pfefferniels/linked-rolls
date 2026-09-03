import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { MIDIControlEvents } from 'midifile-ts'
import { paperAt, paperSeconds, WELTE_SPOOL } from 'welte-t100-emulator'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation } from '../src/Emulation'
import { DynamicsCurve, PedalCurve, PerformedPedalEvent } from '../src/ReproducingSystem'
import { secondsAt, welteT100System } from '../src/systems/welteT100'
import { atConstantSpeed, SPENCER_FEET_PER_MINUTE } from '../src/RollCopy'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')
const edition = importJsonLd(JSON.parse(file))
const view = new EditionView(edition)

const emulation = new Emulation(welteT100System)
emulation.emulateVersion(edition.versions[0], view)

const dynamics = (name: string) =>
    emulation.curves.find((curve): curve is DynamicsCurve => curve.kind === 'dynamics' && curve.name === name)!
const pedal = (name: string) =>
    emulation.curves.find((curve): curve is PedalCurve => curve.kind === 'pedal' && curve.name === name)!

const spread = (values: Float64Array) =>
    values.reduce((most, value) => Math.max(most, value), -Infinity)
    - values.reduce((least, value) => Math.min(least, value), Infinity)

describe('the time axis', () => {
    it('is the take-up spool', () => {
        expect(emulation.options.spool).toEqual(WELTE_SPOOL)
        expect(secondsAt(WELTE_SPOOL, 1450)).toEqual(paperSeconds(WELTE_SPOOL, 145))
    })

    it('takes 30 s over the first 1.45 m of paper, as Gottschewski checks it', () => {
        // Die Interpretation als Kunstwerk, p. 137
        expect(secondsAt(WELTE_SPOOL, 1450)).toBeCloseTo(30, 1)
    })

    it('can be walked back from time to place', () => {
        expect(paperAt(WELTE_SPOOL, secondsAt(WELTE_SPOOL, 120))).toBeCloseTo(12, 9)
    })

    it('is a constant speed for a scanned roll', () => {
        const placeAt = atConstantSpeed(SPENCER_FEET_PER_MINUTE)
        expect(placeAt(60)).toBeCloseTo(8.3 * 304.8, 9)
        expect(placeAt(30) * 2).toBeCloseTo(placeAt(60), 9)
    })
})

/**
 * The bass and the treble half of the keyboard follow separate stacks
 * of expression valves. Routing a perforation to the wrong stack, or to
 * neither, leaves a velocity curve flat, so emulating a real edition is
 * the check that the scopes still reach the right side.
 */
describe('the dynamics of a version', () => {
    it('shapes both halves of the keyboard', () => {
        expect(dynamics('bass').travel.length).toBeGreaterThan(1000)
        expect(dynamics('treble').travel.length).toBeGreaterThan(1000)

        expect(spread(dynamics('bass').travel)).toBeGreaterThan(0.2)
        expect(spread(dynamics('treble').travel)).toBeGreaterThan(0.2)
    })

    it('shapes them independently', () => {
        expect(dynamics('bass').travel).not.toEqual(dynamics('treble').travel)
    })

    it('keeps the bellows between its rails', () => {
        for (const curve of [dynamics('bass'), dynamics('treble')]) {
            curve.travel.forEach(value => {
                expect(value).toBeGreaterThanOrEqual(-1e-9)
                expect(value).toBeLessThanOrEqual(1 + 1e-9)
            })
        }
    })

    it('samples the curve along the roll', () => {
        const { place, seconds } = dynamics('bass')
        expect(place[0]).toEqual(0)
        expect(seconds[0]).toEqual(0)
        expect(place[place.length - 1]).toBeGreaterThan(1000)
        // the paper runs faster as the spool fills
        const early = seconds[1000] - seconds[0]
        const late = seconds[seconds.length - 1] - seconds[seconds.length - 1001]
        expect(late).toBeLessThan(early)
    })

    it('gives every note a velocity within the map', () => {
        const noteOns = emulation.midiEvents.filter(event => event.type === 'noteOn')
        expect(noteOns.length).toBeGreaterThan(100)

        const { piano, forte } = emulation.options.velocity
        noteOns.forEach(event => {
            const velocity = (event as { velocity: number }).velocity
            expect(velocity).toBeGreaterThanOrEqual(piano)
            expect(velocity).toBeLessThanOrEqual(forte)
        })
        expect(spread(Float64Array.from(noteOns, event => (event as { velocity: number }).velocity))).toBeGreaterThan(10)
    })
})

/**
 * A red Welte's pedals are bellows too, and the point of emulating them
 * is that they travel: a change asked for by the roll takes a fifth of a
 * second or so, so the controller stream has to carry intermediate
 * positions and not two values.
 */
describe('the pedals of a version', () => {
    const pedalEvents = emulation.midiEvents
        .filter((event): event is PerformedPedalEvent => event.type === 'damper')

    it('lifts the dampers fully and lets them travel', () => {
        const { travel } = pedal('damper')
        expect(travel.reduce((most, value) => Math.max(most, value), 0)).toBeGreaterThan(0.99)
        const inTransit = travel.filter(value => value > 0.1 && value < 0.9).length
        expect(inTransit).toBeGreaterThan(100)
    })

    it('emits a run of controller steps for every perforation', () => {
        expect(pedalEvents.length).toBeGreaterThan(200)
        pedalEvents.forEach(event => {
            expect(event.value).toBeGreaterThanOrEqual(0)
            expect(event.value).toBeLessThanOrEqual(127)
        })
        expect(new Set(pedalEvents.map(event => event.value)).size).toBeGreaterThan(2)
    })

    it('attributes each step to a pedal perforation', () => {
        const pedals = new Set(emulation.negotiatedEvents
            .filter(event => event.type === 'expression' && event.expressionType.startsWith('SustainPedal'))
            .map(event => event.id))
        pedalEvents.forEach(event => expect(pedals.has(event.performs.id)).toBe(true))
        expect(new Set(pedalEvents.map(event => event.performs.id)).size).toBeGreaterThan(10)
    })

    it('can be thresholded for a renderer that reads the pedal as a switch', () => {
        const switched = new Emulation(welteT100System, { ...emulation.options, pedalMode: 'switch' })
        switched.emulateVersion(edition.versions[0], view)
        const values = new Set(switched.midiEvents
            .filter((event): event is PerformedPedalEvent => event.type === 'damper')
            .map(event => event.value))
        expect([...values].sort()).toEqual([0, 127])
    })
})

describe('the MIDI of a version', () => {
    const midi = emulation.asMIDI()
    const track = midi.tracks[0]

    it('carries the sustain pedal as a continuous controller', () => {
        const sustain = track.filter(event =>
            event.type === 'channel' && event.subtype === 'controller' && event.controllerType === MIDIControlEvents.SUSTAIN)
        expect(sustain.length).toBeGreaterThan(200)
        expect(new Set(sustain.map(event => (event as { value: number }).value)).size).toBeGreaterThan(2)
    })

    it('labels every pedal perforation that moves the pedal', () => {
        const labels = new Set(track
            .filter(event => event.type === 'meta' && event.subtype === 'text')
            .map(event => (event as { text: string }).text))
        const pedals = emulation.negotiatedEvents
            .filter(event => event.type === 'expression' && event.expressionType.startsWith('SustainPedal'))

        // a second "on" while the latch is already set is read but changes nothing
        const effective = pedals.filter((event, index) =>
            index === 0 || (event as { expressionType: string }).expressionType !== (pedals[index - 1] as { expressionType: string }).expressionType)
        expect(effective.length).toBeGreaterThan(50)
        effective.forEach(pedal => expect(labels.has(pedal.id)).toBe(true))
    })

    it('uses whole ticks that add up to the event times', () => {
        const total = track.reduce((sum, event) => sum + event.deltaTime, 0)
        track.forEach(event => expect(Number.isInteger(event.deltaTime)).toBe(true))
        const last = emulation.midiEvents[emulation.midiEvents.length - 1]
        expect(total).toEqual(Math.round(last.at * 1000))
    })
})
