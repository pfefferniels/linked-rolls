import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/io/importJsonLd'
import { emulate, Emulation, midiOf, withPlacementsApplied } from '../src/emulation/Emulation'
import { edition as placed } from './editionFixture'
import { flat } from './flat'
import { mm } from '../src/model/Quantity'

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')
const edition = importJsonLd(JSON.parse(file))
const version = edition.versions[0]

describe('emulating a version through a reproducing system', () => {
    const emulation = new Emulation(flat)
    emulation.emulateVersion(version, edition)

    it('negotiates the notes and the expressions of the version, in order of place', () => {
        const types = new Set(emulation.negotiatedEvents.map(event => event.type))
        expect(types).toEqual(new Set(['note', 'expression']))
        const places = emulation.negotiatedEvents.map(event => event.horizontal.from)
        expect(places).toEqual([...places].sort((a, b) => a - b))
    })

    it('plays every note with the options it was given', () => {
        const noteOns = emulation.midiEvents.filter(event => event.type === 'noteOn')
        expect(noteOns.length).toBeGreaterThan(100)
        noteOns.forEach(event => expect((event as { velocity: number }).velocity).toEqual(64))

        const louder = new Emulation(flat, { velocity: 100 })
        louder.emulateVersion(version, edition)
        louder.midiEvents
            .filter(event => event.type === 'noteOn')
            .forEach(event => expect((event as { velocity: number }).velocity).toEqual(100))
    })

    it('restricts the notes to a range of the roll', () => {
        const part = new Emulation(flat)
        part.emulateVersion(version, edition, { range: [mm(2000), mm(3000)] })
        const noteOns = part.midiEvents.filter(event => event.type === 'noteOn')
        expect(noteOns.length).toBeGreaterThan(0)
        expect(noteOns.length).toBeLessThan(emulation.midiEvents.filter(event => event.type === 'noteOn').length)
        noteOns.forEach(event => {
            expect(event.performs.horizontal.from).toBeGreaterThan(2000)
            expect(event.performs.horizontal.from).toBeLessThan(3000)
        })
    })

    it('starts at the first note when asked to', () => {
        const skipped = new Emulation(flat)
        skipped.emulateVersion(version, edition, { skipToFirstNote: true })
        expect(skipped.midiEvents[0].at).toEqual(0)
        expect(skipped.midiEvents.every(event => event.at >= 0)).toBe(true)
    })

    it('finds the events performing a note', () => {
        const note = emulation.negotiatedEvents.find(event => event.type === 'note')!
        expect(emulation.findEventsPerforming(note.id).map(event => event.type)).toEqual(['noteOn', 'noteOff'])
    })

    it('labels every note in the MIDI with its symbol and names the system', () => {
        const track = emulation.asMIDI().tracks[0]
        const texts = track
            .filter(event => event.type === 'meta' && event.subtype === 'text')
            .map(event => (event as { text: string }).text)
        expect(texts[0]).toEqual('linked-rolls (flat)')
        const labels = new Set(texts)
        emulation.negotiatedEvents
            .filter(event => event.type === 'note')
            .forEach(note => expect(labels.has(note.id)).toBe(true))
    })

    it('ends the track as a standard MIDI file requires, once', () => {
        const track = emulation.asMIDI().tracks[0]
        expect(track.at(-1)).toEqual({ type: 'meta', subtype: 'endOfTrack', deltaTime: 0 })
        expect(track.filter(event => event.type === 'meta' && event.subtype === 'endOfTrack')).toHaveLength(1)
    })
})

/** The functions the class is built on hold nothing and change nothing they are given. */
describe('emulating without keeping anything', () => {
    it('gives what the class keeps', () => {
        const emulation = new Emulation(flat)
        emulation.emulateVersion(version, edition)
        const emulated = emulate(flat, version, edition)

        expect(emulated.events).toEqual(emulation.midiEvents)
        expect(emulated.negotiated).toEqual(emulation.negotiatedEvents)
        expect(midiOf(emulated.events, flat.name, flat.defaultOptions, emulated.source)).toEqual(emulation.asMIDI())
    })

    it('leaves the events it writes out in the order they were given', () => {
        const { events } = emulate(flat, version, edition)
        const reversed = [...events].reverse()
        midiOf(reversed, flat.name, {})
        expect(reversed).toEqual([...events].reverse())
    })

    it('places the events without moving those it was given', () => {
        const e = placed()
        const { negotiated } = emulate(flat, e.versions[0], e)
        const unplaced = negotiated.map(event => ({ ...event, horizontal: { ...event.horizontal, from: mm(event.horizontal.from + 7) } }))
        const before = structuredClone(unplaced)

        withPlacementsApplied(e, unplaced)
        expect(unplaced).toEqual(before)
    })
})
