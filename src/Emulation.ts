import { AnyEvent, MIDIControlEvents, MidiFile } from "midifile-ts";
import { idOf } from "./Assumption";
import { EditionView } from "./EditionView";
import { AnySymbol, pairsAmong, placementsOf } from "./Symbol";
import { Version } from "./Version";
import {
    AnyPerformedRollFeature,
    EmulatedCurve,
    NegotiatedEvent,
    PerformedPedalEvent,
    ReproducingSystem,
    RollProperties
} from "./ReproducingSystem";
import { add, mean, Millimeters, mm, seconds, subtract } from "./Quantity";

export type EmulationScope = {
    /** Only notes whose onset lies within this span of the roll are played. */
    range?: [Millimeters, Millimeters]

    /** Start the clock at the first note rather than at the beginning of the roll. */
    skipToFirstNote?: boolean
}

/** The punch diameter the edition's copies report, where any of them does. */
const punchDiameterOf = (view: EditionView): Millimeters | undefined => {
    const measured = view.edition.copies
        .map(copy => copy.measurements.punchDiameter?.value)
        .filter((value): value is Millimeters => value !== undefined && value > 0)
    return measured.length > 0 ? mean(measured) : undefined
}

const propertiesOf = (view: EditionView): RollProperties => ({
    punchDiameter: punchDiameterOf(view),
    tempo: view.edition.tempoAdjustment
})

/** The onset a symbol has on each copy carrying it, by the copy's index, as the mean of its holes there. */
const onsetsByCopy = (view: EditionView, symbolId: string): Map<number, Millimeters> => {
    const symbol = view.get<AnySymbol>(symbolId)
    if (!symbol) return new Map()

    const onsets = view.carriersOf(symbol).flatMap((carrier): [number, Millimeters][] => {
        const copy = view.getPath(carrier.id)?.[1]
        return typeof copy === 'number' ? [[copy, carrier.horizontal.from]] : []
    })
    const copies = new Set(onsets.map(([copy]) => copy))
    return new Map(
        [...copies].map(copy => [copy, mean(onsets.filter(([at]) => at === copy).map(([, onset]) => onset))])
    )
}

/**
 * The measured distance from the onset of the reference to the onset of
 * the follower on each copy carrying both, negative where the follower
 * comes first there.
 */
const offsetsBetween = (view: EditionView, followerId: string, referenceId: string): Millimeters[] => {
    const references = onsetsByCopy(view, referenceId)
    return [...onsetsByCopy(view, followerId)].flatMap(([copy, onset]) => {
        const reference = references.get(copy)
        return reference === undefined ? [] : [subtract(onset, reference)]
    })
}

type Offsets = (followerId: string, referenceId: string) => Millimeters[]

/**
 * How far before or after its reference a follower is put when the
 * measurement does not already have it there: as far as the copies
 * that agree with the statement put it, and one gap where none does.
 */
const distanceOnSide = (side: 'before' | 'after', offsets: readonly Millimeters[], gap: Millimeters): Millimeters => {
    const agreeing = offsets.filter(offset => side === 'before' ? offset < 0 : offset > 0)
    return agreeing.length > 0 ? mm(Math.abs(mean(agreeing))) : gap
}

/**
 * How far each event has to move for the placements to hold:
 * an aligned event takes the onset of its reference, one placed before
 * or after its reference keeps its place where the measurement has it
 * on that side and is moved there where it does not, and a paired
 * event follows its partner so that the distance between the two is
 * kept. Events that stay where they are do not appear.
 */
const displacementsOf = (
    events: readonly NegotiatedEvent[],
    offsetsBetween: Offsets,
    gap: Millimeters
): Map<NegotiatedEvent, Millimeters> => {
    const byId = new Map(events.map(event => [event.id, event]))

    /** Where an event comes to lie once its statement and those of its references hold. */
    const placedOnsetOf = (event: NegotiatedEvent, visited: ReadonlySet<string> = new Set()): Millimeters => {
        const measured = event.horizontal.from
        const placement = placementsOf(event)[0]
        const reference = placement && byId.get(idOf(placement.reference))
        if (!placement || !reference || reference.id === event.id || visited.has(event.id)) return measured

        const referenceOnset = placedOnsetOf(reference, new Set([...visited, event.id]))
        const distance = (side: 'before' | 'after') =>
            distanceOnSide(side, offsetsBetween(event.id, reference.id), gap)
        switch (placement.relation) {
            case 'alignedWith': return referenceOnset
            case 'before': return measured < referenceOnset ? measured : subtract(referenceOnset, distance('before'))
            case 'after': return measured > referenceOnset ? measured : add(referenceOnset, distance('after'))
        }
    }

    const displacements = new Map(
        events
            .map((event): [NegotiatedEvent, Millimeters] => [event, subtract(placedOnsetOf(event), event.horizontal.from)])
            .filter(([, distance]) => distance !== 0)
    )

    pairsAmong(events).forEach(([one, other]) => {
        const shared = displacements.get(one) ?? displacements.get(other)
        if (shared === undefined) return
        displacements.set(one, shared)
        displacements.set(other, shared)
    })

    return displacements
}

/**
 * A version of the edition, performed: the symbols are negotiated into
 * placed events, the reproducing system plays them, and the result goes
 * out as MIDI in which every note and pedal step is labelled with the
 * symbol it performs.
 */
export class Emulation<Options extends object> {
    readonly system: ReproducingSystem<Options>
    options: Options

    midiEvents: AnyPerformedRollFeature[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    curves: readonly EmulatedCurve[] = []

    source?: string

    constructor(system: ReproducingSystem<Options>, options: Options = system.defaultOptions) {
        this.system = system
        this.options = options
    }

    /**
     * Moves the negotiated events to where their statements put them.
     * The view supplies the copies, whose measurements decide how far
     * before or after its reference a perforation goes, and a punch
     * diameter, or a millimetre, where no copy agrees with a statement.
     */
    applyConstraints(view: EditionView) {
        const gap = punchDiameterOf(view) ?? mm(1)
        const offsets: Offsets = (follower, reference) => offsetsBetween(view, follower, reference)
        displacementsOf(this.negotiatedEvents, offsets, gap).forEach((distance, event) => {
            event.horizontal.from = add(event.horizontal.from, distance)
            event.horizontal.to = add(event.horizontal.to, distance)
        })
    }

    emulateVersion(
        version: Version,
        view: EditionView,
        { range, skipToFirstNote = false }: EmulationScope = {}
    ) {
        this.source = version.id

        this.negotiatedEvents =
            view.snapshot(version.id)
                .filter(s => s.type === 'note' || s.type === 'expression')
                .filter(s => {
                    if (range && s.type === 'note') {
                        const dimensions = view.dimensionOf(s)
                        if (!dimensions) return true // in case of doubt, include the note

                        // check if the note onset is within the specified range
                        const onset = dimensions.horizontal.from
                        return onset > range[0] && onset < range[1]
                    }
                    return true
                })
                .map((e) => view.simplifySymbol(e))
                .filter(s => s !== null)

        if (this.negotiatedEvents.length === 0) {
            this.midiEvents = []
            this.curves = []
            return this.midiEvents
        }

        this.applyConstraints(view);

        const performance = this.system.perform(this.negotiatedEvents, this.options, propertiesOf(view))
        this.curves = performance.curves

        const onsets = performance.events.filter(event => event.type === 'noteOn').map(event => event.at)
        const origin = seconds(skipToFirstNote && onsets.length > 0 ? Math.min(...onsets) : 0)

        this.midiEvents = performance.events
            .map(event => ({ ...event, at: subtract(event.at, origin) }))
            .filter(event => event.at >= 0)
            .sort((a, b) => a.at - b.at)
        return this.midiEvents
    }

    findEventsPerforming(id: string) {
        return this.midiEvents.filter(event => event.performs.id === id)
    }

    asMIDI(): MidiFile {
        const TICKS_PER_SECOND = 1000
        const events: AnyEvent[] = []
        this.midiEvents.sort((a, b) => a.at - b.at)

        const text = (text: string, deltaTime = 0): AnyEvent => ({ type: 'meta', subtype: 'text', text, deltaTime })
        const controller = (controllerType: number, value: number, deltaTime = 0): AnyEvent =>
            ({ type: 'channel', subtype: 'controller', controllerType, value, deltaTime, channel: 0 })
        const controllerOf = (event: PerformedPedalEvent) =>
            event.type === 'damper' ? MIDIControlEvents.SUSTAIN : MIDIControlEvents.SOFT_PEDAL

        events.push(text(`linked-rolls (${this.system.name})`))
        if (this.source) {
            events.push(text(this.source))
        }
        for (const [key, value] of Object.entries(this.options)) {
            events.push(text(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`))
        }

        events.push({
            type: 'meta',
            subtype: 'setTempo',
            microsecondsPerBeat: 1000000,
            deltaTime: 0
        })

        // both pedals start at rest
        events.push(controller(MIDIControlEvents.SUSTAIN, 0), controller(MIDIControlEvents.SOFT_PEDAL, 0))

        // a pedal step is labelled with its perforation only where that
        // perforation changes, so the file is not swamped with labels
        const lastCause: Partial<Record<PerformedPedalEvent['type'], string>> = {}

        let currentTick = 0
        for (const event of this.midiEvents) {
            const tick = Math.round(event.at * TICKS_PER_SECOND)
            const deltaTime = tick - currentTick
            currentTick = tick

            if (event.type === 'noteOn') {
                events.push(text(event.performs.id, deltaTime))
                events.push({
                    type: 'channel',
                    subtype: 'noteOn',
                    noteNumber: event.pitch,
                    velocity: +event.velocity.toFixed(0),
                    deltaTime: 0,
                    channel: 0
                })
            }
            else if (event.type === 'noteOff') {
                events.push({
                    type: 'channel',
                    subtype: 'noteOff',
                    noteNumber: event.pitch,
                    velocity: 127,
                    deltaTime,
                    channel: 0
                })
            }
            else {
                const labelled = lastCause[event.type] === event.performs.id
                lastCause[event.type] = event.performs.id
                if (!labelled) {
                    events.push(text(event.performs.id, deltaTime))
                }
                events.push(controller(controllerOf(event), event.value, labelled ? deltaTime : 0))
            }
        }

        return {
            header: {
                ticksPerBeat: TICKS_PER_SECOND,
                formatType: 0,
                trackCount: 1
            },
            tracks: [events]
        }
    }
}
