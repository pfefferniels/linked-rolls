import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { importJsonLd } from '../src/importJsonLd'
import { EditionView } from '../src/EditionView'
import { Emulation } from '../src/Emulation'
import { NegotiatedEvent, ReproducingSystem } from '../src/ReproducingSystem'
import { welteT100 } from '../src/TrackerBar'
import { Note } from '../src/Symbol'

/**
 * A system with no mechanism at all: every note sounds at the one velocity
 * it is given, and a millimetre of paper lasts a hundredth of a second.
 * What it exercises is the core: negotiating a version, restricting it,
 * and writing the result out with its labels.
 */
const flat: ReproducingSystem<{ velocity: number }> = {
    name: 'flat',
    trackerBar: welteT100,
    defaultOptions: { velocity: 64 },
    perform: (events, { velocity }) => ({
        events: events
            .filter((event): event is NegotiatedEvent & Note => event.type === 'note')
            .flatMap(note => [
                { type: 'noteOn' as const, performs: note, pitch: note.pitch, velocity, at: note.horizontal.from / 100 },
                { type: 'noteOff' as const, performs: note, pitch: note.pitch, velocity: 127, at: note.horizontal.to / 100 }
            ]),
        curves: []
    })
}

const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')
const edition = importJsonLd(JSON.parse(file))
const view = new EditionView(edition)
const version = edition.versions[0]

describe('emulating a version through a reproducing system', () => {
    const emulation = new Emulation(flat)
    emulation.emulateVersion(version, view)

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
        louder.emulateVersion(version, view)
        louder.midiEvents
            .filter(event => event.type === 'noteOn')
            .forEach(event => expect((event as { velocity: number }).velocity).toEqual(100))
    })

    it('restricts the notes to a range of the roll', () => {
        const part = new Emulation(flat)
        part.emulateVersion(version, view, { range: [2000, 3000] })
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
        skipped.emulateVersion(version, view, { skipToFirstNote: true })
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
})
