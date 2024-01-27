/**
 * The original code of the calculateVelocities() method,
 * written by Kitty Shi and Craig Stuart Sapp,
 * was taken from the midi2exp project (https://github.com/pianoroll/midi2exp)
 * and adapted to the different data representation.
 */
import { CollatedEvent, Expression, Note, NoteOffEvent, NoteOnEvent, RelativePlacement, SustainPedalOffEvent, SustainPedalOnEvent, TempoAdjustment } from "./.ldo/rollo.typings";
import { Assumption } from "./Editor";

function resize<T>(arr: T[], newSize: number, defaultValue: T) {
    while (newSize > arr.length)
        arr.push(defaultValue);
}

export type MIDIEvent =
    NoteOnEvent |
    NoteOffEvent |
    SustainPedalOnEvent | SustainPedalOffEvent

type FromCollatedEvent = {
    fromCollatedEvent: CollatedEvent
}

type WithAssumedDimension = {
    assumedDimension: [number, number]
}

type NegotiatedEvent = (Note | Expression) & WithAssumedDimension & FromCollatedEvent

type EmulationOptions = {
    welte_p: number
    welte_f: number
    welte_mf: number
    welte_loud: number
    slow_decay_rate: number,
    fastC_decay_rate: number,
    fastD_decay_rate: number,
    slow_step?: number
    fastC_step?: number
    fastD_step?: number
}

export class Emulation {
    midiEvents: MIDIEvent[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    // stores a velocity for every millisecond
    trebleVelocities: number[] = []
    bassVelocities: number[] = []

    startTempo?: number
    endTempo?: number

    options: EmulationOptions

    constructor(options: EmulationOptions = {
        welte_p: 35,
        welte_f: 90,
        welte_mf: 60,
        welte_loud: 75,
        slow_decay_rate: 2380,
        fastC_decay_rate: 300,
        fastD_decay_rate: 400,
    }) {
        options.slow_step = (options.welte_mf - options.welte_p) / options.slow_decay_rate
        options.fastC_step = (options.welte_mf - options.welte_p) / options.fastC_decay_rate
        options.fastD_step = (options.welte_f - options.welte_p) / options.fastD_decay_rate
        this.options = options
    }

    private negotiateEvents(collatedEvents: CollatedEvent[], assumptions: Assumption[]) {
        for (const collatedEvent of collatedEvents) {
            if (collatedEvent.isNonMusical) return
            if (!collatedEvent.wasCollatedFrom || !collatedEvent.wasCollatedFrom.length) return

            // try to negotiate the assumptions
            const mean = meanDimensionOf(collatedEvent)
            if (!mean) continue

            const placements = assumptions.filter(assumption =>
                assumption.type?.["@id"] === 'RelativePlacement' &&
                (assumption as RelativePlacement).placed === collatedEvent) as RelativePlacement[]

            let wasShifted = false
            for (const placement of placements) {
                for (const relativeTo of placement.relativeTo) {
                    const otherMean = meanDimensionOf(relativeTo)
                    if (!otherMean) continue

                    // check if the conditions are met and act only if not
                    if (placement.withPlacementType['@id'] === 'P176StartsBeforeTheStartOf') {
                        if (otherMean[0] <= mean[0]) {
                            if (wasShifted) {
                                // try to negotiate with another placement 
                                // that has been applied already
                                mean[0] = mean[0] + (otherMean[0] - 1) / 2
                            }
                            else {
                                mean[0] = otherMean[0] - 1
                                wasShifted = true
                            }
                        }
                    }
                }
            }

            const negotiated = collatedEvent.wasCollatedFrom[0] as NegotiatedEvent
            negotiated.assumedDimension = mean
            negotiated.fromCollatedEvent = collatedEvent
            this.negotiatedEvents.push(negotiated)
        }

        this.negotiatedEvents.sort((a, b) => a.assumedDimension[0] - b.assumedDimension[0])
    }

    private findRollTempo(assumptions: Assumption[]) {
        const adjustments = assumptions
            .filter(assumption => assumption.type?.["@id"] === 'TempoAdjustment') as TempoAdjustment[]

        let meanStartTempo = 0
        let meanEndTempo = 0
        for (const adjustment of adjustments) {
            meanStartTempo += adjustment.startsWith
            meanEndTempo += adjustment.endsWith
        }
        this.startTempo = meanStartTempo / adjustments.length
        this.endTempo = meanEndTempo / adjustments.length
    }

    private applyRollTempo() {
        for (const event of this.negotiatedEvents) {
            event.assumedDimension[0] = this.rollTimeToPhysicalTime(event.assumedDimension[0]) || 0
            event.assumedDimension[1] = this.rollTimeToPhysicalTime(event.assumedDimension[1]) || 0
        }
    }

    private applyTrackerBarExtension() {

    }

    emulate(collatedEvents: CollatedEvent[], assumptions: Assumption[]) {
        this.negotiateEvents(collatedEvents, assumptions)
        this.findRollTempo(assumptions)
        this.applyTrackerBarExtension()
        this.applyRollTempo()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')

        for (const event of this.negotiatedEvents) {
            if (event.type?.["@id"] === 'Expression') {
                const expression = event as Expression
                if (expression.P2HasType["@id"] === 'SustainPedalOn') {
                    this.midiEvents.push({
                        performs: event.fromCollatedEvent,
                        at: this.rollTimeToPhysicalTime(event.assumedDimension[0]),
                        type: { '@id': 'SustainPedalOnEvent' }
                    } as SustainPedalOnEvent)
            
                }
            }
            else if (event.type?.["@id"] === 'Note') {
                // TODO: check if there is a pitch correction
                
                // take velocity from the calculated velocity list
                const pitch = (event as Note).hasPitch
                if (pitch > 60) {
                    this.insertNote(event, pitch,
                        this.trebleVelocities[+(event.assumedDimension[0] * 1000).toFixed()])
                }
                else {
                    this.insertNote(event, pitch,
                        this.bassVelocities[+(event.assumedDimension[0] * 1000).toFixed()])
                }
            }
        }
    }

    calculateVelocities(scope: 'treble' | 'bass') {
        const velocities = scope === 'treble' ? this.trebleVelocities : this.bassVelocities

        const isMF: boolean[] = [] // is MF hook on?
        const isSlowC: boolean[] = [] // is slow crescendo on?
        const isFastC: boolean[] = [] // is fast crescendo on?
        const isFastD: boolean[] = [] // is fast decrescendo on?

        let lastOnsetMs = this.negotiatedEvents[this.negotiatedEvents.length - 1].assumedDimension[0]
        if (!lastOnsetMs) {
            console.log('Failed calculating the last onset.')
            return
        }
        lastOnsetMs *= 1000

        console.log('last onset=', lastOnsetMs)

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
            if (negotiatedEvent.type?.["@id"] !== 'Expression') continue

            const event = negotiatedEvent as Expression & WithAssumedDimension

            const startMs = event.assumedDimension[0] * 1000
            const endMs = event.assumedDimension[1] * 1000

            // console.log('encoutering expression from', startMs, 'to', endMs)

            if (event.P2HasType['@id'] === 'MezzoforteOn') {
                console.log('MezzoforteOn')
                // update the mezzoforte start time
                // only if the mf valve is not on already
                if (!valve_mf_on) {
                    valve_mf_on = true
                    valve_mf_starttime = startMs
                }
            }
            else if (event.P2HasType['@id'] === 'MezzoforteOff') {
                console.log('MezzoforteOff')
                if (valve_mf_on) {
                    // fill from the mezzoforte start time to here ...
                    isMF.fill(true, valve_mf_starttime, startMs)
                }
                valve_mf_on = false
            }
            else if (event.P2HasType['@id'] === 'SlowCrescendoOn') {
                console.log('SlowCrescendoOn')
                // update the slow crescendo start time
                // only if slow crescendo is not on already
                if (!valve_slowc_on) {
                    valve_slowc_on = true;
                    valve_slowc_starttime = startMs;
                }
            }
            else if (event.P2HasType['@id'] === 'SlowCrescendoOff') {
                console.log('SlowCrescendoOff')
                if (valve_slowc_on) {
                    // fill from the mezzoforte start time to here ...
                    isSlowC.fill(true, valve_slowc_starttime, startMs)
                }
                valve_slowc_on = false;
            }
            else if (event.P2HasType['@id'] === 'ForzandoOn') {
                console.log('ForzandoOn')
                // Forzando On/Off are a direct operations (length of perforation matters)
                isFastC.fill(true, startMs, endMs)
            }
            else if (event.P2HasType['@id'] === 'ForzandoOff') {
                console.log('ForzandoOff')
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
            type: { '@id': 'NoteOnEvent' },
            performs: event.fromCollatedEvent,
            velocity,
            at: this.rollTimeToPhysicalTime(event.assumedDimension[0]),
            pitch
        } as NoteOnEvent)

        this.midiEvents.push({
            type: { '@id': 'NoteOffEvent' },
            performs: event.fromCollatedEvent,
            velocity: 127,
            at: this.rollTimeToPhysicalTime(event.assumedDimension[1]),
            pitch
        } as NoteOffEvent)
    }

    private rollTimeToPhysicalTime(rollTime: number) {
        if (!this.startTempo || !this.endTempo) return

        else return rollTime / 60
    }
}

const meanDimensionOf = (collatedEvent: CollatedEvent): [number, number] | undefined => {
    const originalEvents = collatedEvent.wasCollatedFrom
    if (!originalEvents) return

    const meanStart =
        originalEvents.reduce((acc, cur) => acc + cur.P43HasDimension.from, 0) / originalEvents.length
    const meanEnd =
        originalEvents.reduce((acc, cur) => acc + cur.P43HasDimension.to, 0) / originalEvents.length

    return [meanStart, meanEnd]
}
