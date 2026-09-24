import { ActorAssignment, DateAssignment, ObjectAssumption } from "./Assumption.js";
import { Concept, Named } from "./Agent.js";
import { ConditionState } from "./ConditionState.js";
import { WithNote } from "../shared/utils.js";

/**
 * What a copy's features were read from. The kinds run from the paper
 * itself, through files in which the roll has already been read into
 * notes and commands, to a sound recording of the copy being played.
 */
export const sourceKinds = [
    'roll',
    'scan',
    'analysis',
    'reading',
    'emulation',
    'recording'
] as const

export type SourceKind = typeof sourceKinds[number]

/** How each kind of source is referred to in prose. */
export const sourceLabels: Record<SourceKind, string> = {
    roll: 'the roll itself',
    scan: 'a scan of the roll',
    analysis: 'a hole analysis of a scan',
    reading: 'the timed switches of a roll reader',
    emulation: 'an emulated MIDI file',
    recording: 'a sound recording of the copy being played'
}

const measured: readonly SourceKind[] = ['roll', 'scan', 'analysis', 'reading']

const physical: readonly SourceKind[] = ['roll', 'scan']

/**
 * Whether a source of this kind gives positions that were measured. A
 * roll reader measures when each perforation passes its bar. An
 * emulation and a recording give the reading somebody else made: the
 * roll has been turned into notes and commands already, and turning
 * those back into chains of holes reconstructs them.
 */
export const isMeasured = (kind: SourceKind): boolean => measured.includes(kind)

/**
 * Whether a source of this kind bears witness to the paper. Punch
 * diameter, hole separation, punching pattern, marks and writings can
 * be observed on the roll and on an image of it, and on nothing else.
 */
export const bearsPhysicalEvidence = (kind: SourceKind): boolean => physical.includes(kind)

/**
 * Software a capture ran, such as the transcriber that read a recording
 * into notes or the emulator that wrote a MIDI file.
 * @see crmdig:D14 Software
 */
export interface Software {
    /**
     * @see rdfs:label
     */
    name: string

    /**
     * The release, or the model checkpoint of a transcriber.
     * @see owl:versionInfo
     */
    version?: string
}

/**
 * An instrument a copy was played on to be recorded. How it was
 * regulated, where that is known, is its condition.
 * @see crm:E22 Human-Made Object
 */
export interface Instrument extends Named {
    /**
     * @see crm:P44 has condition
     */
    condition?: ObjectAssumption<ConditionState<'general'>>
}

/**
 * The capture by which a copy's features became data: what they were
 * read from, who read them, on what device, with what software and
 * when. It states where the numbers of the edition come from and says
 * nothing about the state of the paper, which is a condition.
 *
 * What is not known is left out. A reader is told about the gap by
 * `reservationsAbout`, which works out what a copy cannot vouch for
 * from what it states here.
 * @see crm:E7 Activity
 */
export interface FeatureSource extends WithNote {
    /**
     * What the features were read from.
     * @see crm:P2 has type
     */
    kind: SourceKind

    /**
     * The file the capture produced, where it has an address.
     * @see crmdig:L11 had output
     */
    output?: string

    /**
     * Who carried out the capture.
     * @see crm:P14 carried out by
     */
    actor?: ActorAssignment

    /**
     * The make and model of the scanner, camera or player the capture
     * ran on.
     * @see crmdig:L12 happened on device
     */
    device?: Concept

    /**
     * The software the capture ran, each with its version.
     * @see crmdig:L23 used software or firmware
     */
    software?: Software[]

    /**
     * The instrument the copy was played on, where the capture is a
     * recording of it.
     * @see crm:P16 used specific object
     */
    instrument?: ObjectAssumption<Instrument>

    /**
     * When the capture took place.
     * @see crm:P4 has time-span
     */
    date?: DateAssignment
}
