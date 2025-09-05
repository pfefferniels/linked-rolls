import { AnyEvent, MIDIControlEvents, MidiFile } from "midifile-ts";
import { AnySymbol, Expression, ExpressionType, Note } from "./Symbol";
import { KinematicConversion, PlaceTimeConversion } from "./PlaceTimeConversion";
import { Version } from "./Version";
import { RollFeature } from "./Feature";
import { RollTempo } from "./Edition";
import { EditionView } from "./EditionView";

function resize<T>(arr: T[], newSize: number, defaultValue: T) {
    while (newSize > arr.length)
        arr.push(defaultValue);
}

interface PerformedRollFeature<T> {
    type: T
    performs: (AnySymbol | NegotiatedEvent)
    at: number
}

interface PerformedNoteEvent<T> extends PerformedRollFeature<T> {
    pitch: number;
    velocity: number;
}

export interface PerformedNoteOnEvent extends PerformedNoteEvent<'noteOn'> { }
export interface PerformedNoteOffEvent extends PerformedNoteEvent<'noteOff'> { }
export interface PerformedSustainPedalOnEvent extends PerformedRollFeature<'sustainPedalOn'> { }
export interface PerformedSustainPedalOffEvent extends PerformedRollFeature<'sustainPedalOff'> { }
export interface PerformedSoftPedalOnEvent extends PerformedRollFeature<'softPedalOn'> { }
export interface PerformedSoftPedalOffEvent extends PerformedRollFeature<'softPedalOff'> { }

export type AnyPerformedRollFeature =
    PerformedNoteOnEvent |
    PerformedNoteOffEvent |
    PerformedSustainPedalOnEvent | PerformedSustainPedalOffEvent |
    PerformedSoftPedalOnEvent | PerformedSoftPedalOffEvent

type AssumedPhysicalTimeSpan = {
    assumedPhysicalTime?: [number, number]
}

export type NegotiatedEvent =
    Omit<Note | Expression, 'carriers'>
    & Pick<RollFeature, 'horizontal' | 'vertical'>
    & AssumedPhysicalTimeSpan

export type EmulationOptions = {
    welte_p: number
    welte_f: number
    welte_mf: number
    welte_loud: number
    slow_decay_rate: number
    fastC_decay_rate: number
    fastD_decay_rate: number
    trackerBarDiameter: number
    punchExtensionFraction: number
    slow_step?: number
    fastC_step?: number
    fastD_step?: number
    division: number
}

export class Emulation {
    placeTimeConversion: PlaceTimeConversion = new KinematicConversion()
    midiEvents: (AnyPerformedRollFeature)[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    // stores a velocity for every millisecond
    trebleVelocities: number[] = []
    bassVelocities: number[] = []

    startTempo?: number
    endTempo?: number

    source?: string

    options: EmulationOptions

    constructor(options: EmulationOptions = {
        welte_p: 35,
        welte_f: 90,
        welte_mf: 60,
        welte_loud: 75,
        trackerBarDiameter: 1.413,
        punchExtensionFraction: 0.75,
        slow_decay_rate: 2380,
        fastC_decay_rate: 300,
        fastD_decay_rate: 400,
        division: 54
    }) {
        options.slow_step = (options.welte_mf - options.welte_p) / options.slow_decay_rate
        options.fastC_step = (options.welte_mf - options.welte_p) / options.fastC_decay_rate
        options.fastD_step = -(options.welte_f - options.welte_p) / options.fastD_decay_rate
        this.options = options
    }

    private findRollTempo(tempo?: RollTempo) {
        if (!tempo) {
            this.startTempo = 104.331
            this.endTempo = 104.331
            return
        }

        this.startTempo = tempo.startsWith
        this.endTempo = tempo.endsWith
    }

    private assignPhysicalTime(skipToFirstNote = false) {
        if (this.negotiatedEvents.length === 0) return

        const first = skipToFirstNote ? this.negotiatedEvents[0].horizontal.from : 0
        for (const event of this.negotiatedEvents) {
            if (!event.assumedPhysicalTime) {
                // convert from mm to cm and then to time
                event.assumedPhysicalTime = [
                    this.placeTimeConversion.placeToTime((event.horizontal.from - first) / 10),
                    this.placeTimeConversion.placeToTime((event.horizontal.to - first) / 10)
                ]
            }
        }
    }

    private applyTrackerBarExtension() {
        const correction = this.options.trackerBarDiameter * this.options.punchExtensionFraction + 0.5
        for (const event of this.negotiatedEvents) {
            if (event.horizontal.to) {
                event.horizontal.to += correction
            }
        }
    }

    private convertEventsToMIDI() {
        for (const event of this.negotiatedEvents) {
            if (event.type === 'expression') {
                const expression = event as unknown as Expression

                const map = new Map<ExpressionType, string>([
                    ['SustainPedalOn', 'sustainPedalOn'],
                    ['SustainPedalOff', 'sustainPedalOff'],
                    ['SoftPedalOn', 'softPedalOn'],
                    ['SoftPedalOff', 'softPedalOff']
                ])

                if (map.has(expression.expressionType)) {
                    this.midiEvents.push({
                        type: map.get(expression.expressionType)! as 'sustainPedalOn' | 'sustainPedalOff' | 'softPedalOn' | 'softPedalOff',
                        performs: event,
                        at: event.assumedPhysicalTime![0],
                    })
                }
            }
            else if (event.type === 'note') {
                const note = event as unknown as Note

                // take velocity from the calculated velocity list
                const pitch = note.pitch
                if (event.vertical.from >= this.options.division) {
                    this.insertNote(
                        event,
                        pitch,
                        this.trebleVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
                else {
                    this.insertNote(
                        event,
                        pitch,
                        this.bassVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
            }
        }

        this.midiEvents.sort((a, b) => a.at - b.at)
    }

    emulateFromRoll(events: (Note | Expression)[], view: EditionView) {
        this.startTempo = 104.331
        this.endTempo = 104.331

        this.negotiatedEvents = events
            .map(e => view.simplifySymbol(e))
            .filter(s => s !== null)

        this.applyTrackerBarExtension()
        this.assignPhysicalTime()
        this.applyTrackerBarExtension()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

    emulateVersion(
        version: Version,
        view: EditionView,
        rollTempo?: RollTempo,
        skipToFirstNote: boolean = false
    ) {
        this.source = version.id
        
        this.negotiatedEvents =
            view.snapshot(version.id)
                .filter(s => s.type === 'note' || s.type === 'expression')
                .map((e) => view.simplifySymbol(e))
                .filter(s => s !== null)

        this.findRollTempo(rollTempo)
        this.applyTrackerBarExtension()
        this.assignPhysicalTime(skipToFirstNote)
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

    /**
     * The original code of the calculateVelocities() method,
     * written by Kitty Shi and Craig Stuart Sapp,
     * was taken from the midi2exp project (https://github.com/pianoroll/midi2exp)
     * and adapted to the different data representation.
     */
    calculateVelocities(scope: 'treble' | 'bass') {
        if (!this.negotiatedEvents.length) return

        const velocities = scope === 'treble' ? this.trebleVelocities : this.bassVelocities

        const isMF: boolean[] = [] // is MF hook on?
        const isSlowC: boolean[] = [] // is slow crescendo on?
        const isFastC: boolean[] = [] // is fast crescendo on?
        const isFastD: boolean[] = [] // is fast decrescendo on?

        let lastOnsetMs = this.negotiatedEvents[this.negotiatedEvents.length - 1].assumedPhysicalTime![0]
        if (!lastOnsetMs) {
            console.log('Failed calculating the last onset.')
            return
        }
        lastOnsetMs *= 1000

        // set all of the times to piano by default
        resize(velocities, lastOnsetMs, this.options.welte_p)

        // fill all hook maps with false
        for (const target of [isMF, isSlowC, isFastC, isFastD]) {
            resize(target, lastOnsetMs, false)
        }

        // Lock and Cancel
        let valve_mf_on = false;
        let valve_slowc_on = false;

        let valve_mf_starttime = 0;        // 0 for off
        let valve_slowc_starttime = 0;

        // First pass: For each time section calculate the current boolean
        // state of each expression.

        for (const negotiatedEvent of this.negotiatedEvents) {
            if (negotiatedEvent.type !== 'expression') continue

            if (scope === 'treble' && negotiatedEvent.vertical.from < this.options.division) continue
            else if (scope === 'bass' && negotiatedEvent.vertical.from >= this.options.division) continue

            const event = negotiatedEvent as unknown as Expression & AssumedPhysicalTimeSpan

            const startMs = event.assumedPhysicalTime![0] * 1000
            const endMs = event.assumedPhysicalTime![1] * 1000

            // console.log('encoutering expression', event.expressionType["@id"], 'from', startMs, 'to', endMs)

            if (event.expressionType === 'MezzoforteOn') {
                // update the mezzoforte start time
                // only if the mf valve is not on already
                if (!valve_mf_on) {
                    valve_mf_on = true
                    valve_mf_starttime = startMs
                }
            }
            else if (event.expressionType === 'MezzoforteOff') {
                if (valve_mf_on) {
                    // fill from the mezzoforte start time to here ...
                    isMF.fill(true, valve_mf_starttime, startMs)
                }
                valve_mf_on = false
            }
            else if (event.expressionType === 'SlowCrescendoOn') {
                // update the slow crescendo start time
                // only if slow crescendo is not on already
                if (!valve_slowc_on) {
                    valve_slowc_on = true;
                    valve_slowc_starttime = startMs;
                }
            }
            else if (event.expressionType === 'SlowCrescendoOff') {
                if (valve_slowc_on) {
                    // fill from the mezzoforte start time to here ...
                    isSlowC.fill(true, valve_slowc_starttime, startMs)
                }
                valve_slowc_on = false;
            }
            else if (event.expressionType === 'ForzandoOn') {
                // Forzando On/Off are a direct operations (length of perforation matters)
                isFastC.fill(true, startMs, endMs)
            }
            else if (event.expressionType === 'ForzandoOff') {
                // Forzando On/Off are a direct operations (length of perforation matters)
                isFastD.fill(true, startMs, endMs)
            }
        }
        // TODO: deal with the last case (if crescendo OFF is missing)

        // Second pass, update the current velocity according to the previous one

        let amount = 0.0
        let eps = 0.0001

        for (let i = 1; i < lastOnsetMs; i++) {
            if (!isSlowC[i] && !isFastC[i] && !isFastD[i]) {
                // slow decrescendo is always on
                amount = -this.options.slow_step!;
            } else {
                amount =
                    (isSlowC[i] ? this.options.slow_step! : 0) +
                    (isFastC[i] ? this.options.fastC_step! : 0) +
                    (isFastD[i] ? this.options.fastD_step! : 0)
            }

            velocities[i] = velocities[i - 1] + amount

            if (isMF[i]) {
                if (velocities[i - 1] > this.options.welte_mf) {
                    if (amount < 0) {
                        velocities[i] = Math.max(this.options.welte_mf + eps, velocities[i])
                    }
                    else {
                        velocities[i] = Math.min(this.options.welte_f, velocities[i]);
                    }
                }
                else if (velocities[i - 1] < this.options.welte_mf) {
                    if (amount > 0) {
                        velocities[i] = Math.min(this.options.welte_mf - eps, velocities[i]);
                    }
                    else {
                        velocities[i] = Math.max(this.options.welte_p, velocities[i]);
                    }
                }
            }
            else {
                // slow crescendo will only reach welte_loud
                if (isSlowC[i] && !isFastC[i] && velocities[i - 1] < this.options.welte_loud) {
                    velocities[i] = Math.min(velocities[i], this.options.welte_loud - eps);
                }
            }
            // regulating max and min
            velocities[i] = Math.max(this.options.welte_p, velocities[i]);
            velocities[i] = Math.min(this.options.welte_f, velocities[i]);
        }
    }

    private insertNote(event: NegotiatedEvent, pitch: number, velocity: number) {
        this.midiEvents.push({
            type: 'noteOn',
            performs: event,
            velocity,
            at: event.assumedPhysicalTime![0],
            pitch
        })

        this.midiEvents.push({
            type: 'noteOff',
            performs: event,
            velocity: 127,
            at: event.assumedPhysicalTime![1],
            pitch
        } as PerformedNoteOffEvent)
    }

    findEventsPerforming(id: string) {
        return this.midiEvents.filter(event => event.performs.id === id)
    }

    asMIDI(): MidiFile {
        const events: AnyEvent[] = []
        this.midiEvents.sort((a, b) => a.at - b.at)

        let currentTime = 0
        // insert metadata first
        events.push({
            type: 'meta',
            subtype: 'text',
            text: 'linked-rolls (based on midi2exp)',
            deltaTime: 0
        })

        if (this.source) {
            events.push({
                type: 'meta',
                subtype: 'text',
                text: this.source,
                deltaTime: 0
            })
        }

        events.push({
            type: 'meta',
            subtype: 'text',
            text: `place-time-conversion: ${this.placeTimeConversion.summary}`,
            deltaTime: 0
        })

        for (const [key, value] of Object.entries(this.options)) {
            events.push({
                type: 'meta',
                subtype: 'text',
                text: `${key}=${value}`,
                deltaTime: 0
            })
        }


        events.push({
            type: 'meta',
            subtype: 'setTempo',
            microsecondsPerBeat: 1000000,
            deltaTime: 0
        })
        for (const event of this.midiEvents) {
            const deltaTimeMs = (event.at - currentTime) * 1000

            if (event.type === 'noteOn') {
                console.log('dealing with note on', event.pitch, event.at, deltaTimeMs)
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
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
                    deltaTime: deltaTimeMs,
                    channel: 0
                })
            }
            else if (event.type === 'sustainPedalOn') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: 0,
                    channel: 0,
                    value: 127
                })
            }
            else if (event.type === 'sustainPedalOff') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: 0,
                    channel: 0,
                    value: 0
                })
            }
            else if (event.type === 'softPedalOn') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SOFT_PEDAL,
                    deltaTime: 0,
                    channel: 0,
                    value: 127
                })
            }
            else if (event.type === 'softPedalOff') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SOFT_PEDAL,
                    deltaTime: 0,
                    channel: 0,
                    value: 0
                })
            }
            currentTime = event.at
        }

        return {
            header: {
                ticksPerBeat: 1000,
                formatType: 0,
                trackCount: 1
            },
            tracks: [events]
        }
    }
}
