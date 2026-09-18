import { bearsPhysicalEvidence, isMeasured, sourceLabels } from "./FeatureSource.js";
import { calibrationOf, featuresOf, RollCopy } from "./RollCopy.js";
import { trackerBarOf } from "./systems/index.js";
import { Version } from "./Version.js";
import { EditionView } from "./EditionView.js";
import { witnessesOf } from "./witnesses.js";

export const reservationTypes = [
    'source-not-stated',
    'source-undocumented',
    'software-not-named',
    'instrument-not-named',
    'features-interpreted',
    'no-physical-evidence',
    'measurement-undocumented',
    'not-calibrated',
    'system-unknown',
    'keeper-unknown'
] as const

export type ReservationType = typeof reservationTypes[number]

/**
 * Something an edition cannot vouch for in one of its copies or
 * versions.
 *
 * A reservation is worked out from what the copy or version states
 * about itself and is never written into the edition: it says that
 * knowledge of it is incomplete, so filling in what is missing makes it
 * go away. Nothing here describes the state of the paper, which is a
 * condition of the copy.
 */
export interface Reservation<T extends string = ReservationType> {
    type: T

    /** What the reservation means for a reader, in one sentence. */
    note: string
}

type Check = (copy: RollCopy) => Reservation | undefined

const sourceStated: Check = copy =>
    copy.readFrom ? undefined : {
        type: 'source-not-stated',
        note: 'The copy does not state what its features were read from.'
    }

const sourceDocumented: Check = copy => {
    const source = copy.readFrom
    if (!source || source.actor || source.device || source.date) return undefined
    return {
        type: 'source-undocumented',
        note: `The copy names ${sourceLabels[source.kind]} as its source, but records nobody who made it, no device and no date.`
    }
}

/** An emulation and a recording are turned into notes by software, which says how far to trust them. */
const softwareNamed: Check = copy => {
    const source = copy.readFrom
    if (!source || isMeasured(source.kind) || source.software?.length) return undefined
    return {
        type: 'software-not-named',
        note: `The copy names ${sourceLabels[source.kind]} as its source, but not the software that turned it into notes.`
    }
}

const instrumentNamed: Check = copy =>
    copy.readFrom?.kind === 'recording' && !copy.readFrom.instrument ? {
        type: 'instrument-not-named',
        note: 'The copy is known from a recording, but neither the instrument it was played on nor its regulation is named.'
    } : undefined

const featuresMeasured: Check = copy =>
    copy.readFrom && !isMeasured(copy.readFrom.kind) ? {
        type: 'features-interpreted',
        note: `The features come from ${sourceLabels[copy.readFrom.kind]}, in which the roll has already been read into notes and commands by somebody else.`
    } : undefined

const physicalEvidence: Check = copy =>
    copy.readFrom && !bearsPhysicalEvidence(copy.readFrom.kind) ? {
        type: 'no-physical-evidence',
        note: 'Punch diameter, hole separation, punching pattern, marks and writings cannot be observed on this source.'
    } : undefined

const measurementDocumented: Check = copy =>
    !copy.measurements.measuredBy && copy.readFrom?.kind !== 'roll' ? {
        type: 'measurement-undocumented',
        note: 'No measuring software is recorded for this copy.'
    } : undefined

const calibrated: Check = copy =>
    calibrationOf(copy) ? undefined : {
        type: 'not-calibrated',
        note: 'The copy is not calibrated against the tracker bar, so its track positions rest on the numbering its source used.'
    }

/**
 * The bar decides what every track on the copy means, so a copy the
 * edition cannot place in a system is read by the T-100 for want of
 * anything better. Between two Welte scales that is a semitone rather
 * than a visible error, which is why it is said out loud.
 */
const systemKnown: Check = copy => {
    const system = copy.production?.system
    if (system === undefined) {
        return {
            type: 'system-unknown',
            note: 'The copy names no reproducing system, so it is read by the T-100 tracker bar.'
        }
    }
    return trackerBarOf(system) ? undefined : {
        type: 'system-unknown',
        note: `The copy names ${system.name || 'a reproducing system'}, which the edition has no tracker bar for, so it is read by the T-100's.`
    }
}

const keeperKnown: Check = copy =>
    copy.keeper ? undefined : {
        type: 'keeper-unknown',
        note: 'Nobody is known to hold the copy, so its paper cannot be consulted.'
    }

/** A check on what a copy's features leave open, which has nothing to say of a copy without any. */
const onFeatures = (check: Check): Check => copy =>
    featuresOf(copy).length > 0 ? check(copy) : undefined

const checks: readonly Check[] = [
    sourceStated,
    sourceDocumented,
    softwareNamed,
    instrumentNamed,
    onFeatures(featuresMeasured),
    onFeatures(physicalEvidence),
    onFeatures(measurementDocumented),
    onFeatures(calibrated),
    onFeatures(systemKnown),
    keeperKnown
]

/**
 * What the edition cannot vouch for in a copy, in the order the
 * checks are listed: where its features came from first, then what
 * the measurement leaves open, then who holds it.
 */
export const reservationsAbout = (copy: RollCopy): Reservation[] =>
    checks.flatMap(check => check(copy) ?? [])

export const versionReservationTypes = [
    'text-not-stated',
    'witnessed-by-statement-only',
    'no-direct-witness'
] as const

export type VersionReservationType = typeof versionReservationTypes[number]

type VersionCheck = (view: EditionView, version: Readonly<Version>) => Reservation<VersionReservationType> | undefined

const textStated: VersionCheck = (_view, version) =>
    version.edits ? undefined : {
        type: 'text-not-stated',
        note: 'The version does not state its edits, so it reads as the version it derives from.'
    }

const witnessedByFeatures: VersionCheck = (view, version) => {
    const witnesses = witnessesOf(view, version.id)
    return witnesses.length > 0 && witnesses.every(({ by }) => by === 'statement') ? {
        type: 'witnessed-by-statement-only',
        note: 'No copy\'s features carry what the version inserts; only copies that state they carry it bear witness to it.'
    } : undefined
}

/**
 * A version every copy reaches only through a version derived from it.
 * Its text is a reconstruction from below, as a lost state's is, and
 * nothing surviving shows it as it stood.
 */
const witnessedAtFirstHand: VersionCheck = (view, version) => {
    const carriers = witnessesOf(view, version.id).filter(({ by }) => by === 'carriers')
    return carriers.length > 0 && carriers.every(({ through }) => through !== undefined) ? {
        type: 'no-direct-witness',
        note: 'No copy carries it at first hand; it is attested only through the versions derived from it.'
    } : undefined
}

const versionChecks: readonly VersionCheck[] = [textStated, witnessedByFeatures, witnessedAtFirstHand]

/** What the edition cannot vouch for in a version, in the order the checks are listed. */
export const reservationsAboutVersion = (view: EditionView, version: Readonly<Version>): Reservation<VersionReservationType>[] =>
    versionChecks.flatMap(check => check(view, version) ?? [])
