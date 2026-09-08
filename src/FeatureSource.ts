import { ActorAssignment, DateAssignment } from "./Assumption";
import { Concept } from "./Agent";
import { WithNote } from "./utils";

/**
 * What a copy's features were read from. The kinds run from the paper
 * itself to a file in which the roll has already been read into notes
 * and commands.
 */
export const sourceKinds = [
    'roll',
    'scan',
    'analysis',
    'emulation',
    'recording'
] as const

export type SourceKind = typeof sourceKinds[number]

/** How each kind of source is referred to in prose. */
export const sourceLabels: Record<SourceKind, string> = {
    roll: 'the roll itself',
    scan: 'a scan of the roll',
    analysis: 'a hole analysis of a scan',
    emulation: 'an emulated MIDI file',
    recording: 'a MIDI recording of the copy being played'
}

const measured: readonly SourceKind[] = ['roll', 'scan', 'analysis']

const physical: readonly SourceKind[] = ['roll', 'scan']

/**
 * Whether a source of this kind gives positions that were measured.
 * An emulation and a recording give the reading somebody else made:
 * the roll has been turned into notes and commands already, and
 * turning those back into holes reconstructs them.
 */
export const isMeasured = (kind: SourceKind): boolean => measured.includes(kind)

/**
 * Whether a source of this kind bears witness to the paper. Punch
 * diameter, hole separation, punching pattern, marks and writings can
 * be observed on the roll and on an image of it, and on nothing else.
 */
export const bearsPhysicalEvidence = (kind: SourceKind): boolean => physical.includes(kind)

/**
 * The capture by which a copy's features became data: what they were
 * read from, who read them, on what device and when. It states where
 * the numbers of the edition come from and says nothing about the
 * state of the paper, which is a condition.
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
     * When the capture took place.
     * @format date
     * @see dcterms:date
     */
    date?: DateAssignment
}
