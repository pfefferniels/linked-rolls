import { NegotiatedEvent, ReproducingSystem } from '../src/ReproducingSystem'
import { welteT100 } from '../src/TrackerBar'
import { Note } from '../src/Symbol'

/**
 * A system with no mechanism at all: every note sounds at the one velocity
 * it is given, and a millimetre of paper lasts a hundredth of a second.
 * What it exercises is the core: negotiating a version, restricting it,
 * and writing the result out with its labels.
 */
export const flat: ReproducingSystem<{ velocity: number }> = {
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
