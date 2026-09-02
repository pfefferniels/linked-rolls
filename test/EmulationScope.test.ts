import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { MIDIControlEvents } from 'midifile-ts'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation, PerformedPedalEvent } from '../src/Emulation'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')
const edition = importJsonLd(JSON.parse(file))
const view = new EditionView(edition)

const emulation = new Emulation()
emulation.emulateVersion(edition.versions[0], view)
const curves = emulation.curves!

const spread = (values: Float64Array) =>
    values.reduce((most, value) => Math.max(most, value), -Infinity)
    - values.reduce((least, value) => Math.min(least, value), Infinity)

/**
 * The bass and the treble half of the keyboard follow separate stacks
 * of expression valves. Routing a perforation to the wrong stack, or to
 * neither, leaves a velocity curve flat, so emulating a real edition is
 * the check that the scopes still reach the right side.
 */
describe('emulating the dynamics of a version', () => {
    it('shapes both halves of the keyboard', () => {
        expect(curves.nuance.bass.travel.length).toBeGreaterThan(1000)
        expect(curves.nuance.treble.travel.length).toBeGreaterThan(1000)

        expect(spread(curves.nuance.bass.travel)).toBeGreaterThan(0.2)
        expect(spread(curves.nuance.treble.travel)).toBeGreaterThan(0.2)
    })

    it('shapes them independently', () => {
        expect(curves.nuance.bass.travel).not.toEqual(curves.nuance.treble.travel)
    })

    it('keeps the bellows between its rails', () => {
        for (const curve of [curves.nuance.bass, curves.nuance.treble]) {
            curve.travel.forEach(value => {
                expect(value).toBeGreaterThanOrEqual(-1e-9)
                expect(value).toBeLessThanOrEqual(1 + 1e-9)
            })
        }
    })

    it('samples the curve along the roll', () => {
        const { place, seconds } = curves.nuance.bass
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

    it('finds the events performing a note', () => {
        const note = emulation.negotiatedEvents.find(event => event.type === 'note')!
        const types = emulation.findEventsPerforming(note.id).map(event => event.type)
        expect(types).toEqual(['noteOn', 'noteOff'])
    })
})

/**
 * A red Welte's pedals are bellows too, and the point of emulating them
 * is that they travel: a change asked for by the roll takes a fifth of a
 * second or so, so the controller stream has to carry intermediate
 * positions and not two values.
 */
describe('emulating the pedals of a version', () => {
    const pedalEvents = emulation.midiEvents
        .filter((event): event is PerformedPedalEvent => event.type === 'damper')

    it('lifts the dampers fully and lets them travel', () => {
        const { travel } = curves.pedals.damper
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
        const switched = new Emulation({ ...emulation.options, pedalMode: 'switch' })
        switched.emulateVersion(edition.versions[0], view)
        const values = new Set(switched.midiEvents
            .filter((event): event is PerformedPedalEvent => event.type === 'damper')
            .map(event => event.value))
        expect([...values].sort()).toEqual([0, 127])
    })
})

describe('writing the emulation as MIDI', () => {
    const midi = emulation.asMIDI()
    const track = midi.tracks[0]

    it('carries the sustain pedal as a continuous controller', () => {
        const sustain = track.filter(event =>
            event.type === 'channel' && event.subtype === 'controller' && event.controllerType === MIDIControlEvents.SUSTAIN)
        expect(sustain.length).toBeGreaterThan(200)
        expect(new Set(sustain.map(event => (event as { value: number }).value)).size).toBeGreaterThan(2)
    })

    it('labels every note and every pedal perforation that moves the pedal', () => {
        const labels = new Set(track
            .filter(event => event.type === 'meta' && event.subtype === 'text')
            .map(event => (event as { text: string }).text))
        const notes = emulation.negotiatedEvents.filter(event => event.type === 'note')
        const pedals = emulation.negotiatedEvents
            .filter(event => event.type === 'expression' && event.expressionType.startsWith('SustainPedal'))

        // a second "on" while the latch is already set is read but changes nothing
        const effective = pedals.filter((event, index) =>
            index === 0 || (event as { expressionType: string }).expressionType !== (pedals[index - 1] as { expressionType: string }).expressionType)
        expect(effective.length).toBeGreaterThan(50)

        notes.forEach(note => expect(labels.has(note.id)).toBe(true))
        effective.forEach(pedal => expect(labels.has(pedal.id)).toBe(true))
    })

    it('uses whole ticks that add up to the event times', () => {
        const total = track.reduce((sum, event) => sum + event.deltaTime, 0)
        track.forEach(event => expect(Number.isInteger(event.deltaTime)).toBe(true))
        const last = emulation.midiEvents[emulation.midiEvents.length - 1]
        expect(total).toEqual(Math.round(last.at * 1000))
    })

    it('starts at the first note when asked to', () => {
        const skipped = new Emulation()
        skipped.emulateVersion(edition.versions[0], view, { skipToFirstNote: true })
        expect(skipped.midiEvents[0].at).toEqual(0)
        expect(skipped.midiEvents.every(event => event.at >= 0)).toBe(true)
    })
})
