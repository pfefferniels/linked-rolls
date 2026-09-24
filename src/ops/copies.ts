/** Operations on the copies: adding and aligning them, and what they state of their source, their carriage and their condition. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { Edition } from "../Edition.js"
import { AnySymbol } from "../Symbol.js"
import { asSymbols, barOf, featuresOf, GeneralRollCondition, isPaperStretch, RollCopy, ScaleReading, Shift } from "../RollCopy.js"
import { systemOf } from "../TrackerBar.js"
import { FeatureSource } from "../FeatureSource.js"
import { applyShift, applyScale, revertShift, revertScale, revertShortening, shortenChains } from "../alignment.js"
import { Belief, ObjectAssumption, ReferenceAssumption, idOf } from "../Assumption.js"
import { Millimeters } from "../Quantity.js"
import { EditionOp, onCopy, stateOf, insertion, insertedIn, referenceHeld, withoutReferences } from "./draft.js"
import { without } from "./immutable.js"
import { featureIdsOf, carriedOnlyOn, forgetFeatures } from "./forget.js"

/**
 * Puts the copy into the edition with a version of its own, which
 * inserts every symbol the copy's own tracker bar reads on it. The
 * version is a reading in that system's words, so it is coded for the
 * system the copy was cut for.
 */
export const createVersion = (copy: RollCopy): EditionOp =>
    draft => {
        const bar = barOf(copy)
        draft.copies.push(copy)
        draft.versions.push({
            id: v4(),
            system: systemOf(bar),
            edits: asSymbols(featuresOf(copy), bar).map(insertion),
            motivations: []
        })
    }

/**
 * Puts the copy into the edition without a version of its own, as for a
 * copy whose features are not read into symbols: one known only from a
 * recording states instead which versions it carries.
 */
export const addCopy = (copy: RollCopy): EditionOp =>
    draft => {
        draft.copies.push(copy)
    }

/** States what the scale is put down to, in place of an earlier reading. */
const readScale = (copy: Draft<RollCopy>, reading: ScaleReading) => {
    if (reading.cause === 'paper') {
        copy.conditions = [...copy.conditions.filter(condition => !isPaperStretch(condition)), reading.condition]
        return
    }
    if (!copy.production) copy.production = {}
    copy.production.speed = reading.speed
}

/**
 * Shifts and then scales the copy's features into line with another
 * copy's, and puts the scale down to what the reading says: the paper,
 * or the speed the copy was cut for.
 */
export const alignCopy = (copyId: string, shift: Shift, scale: number, reading?: ScaleReading): EditionOp =>
    onCopy(copyId, copy => {
        applyShift(shift, copy)
        applyScale(scale, copy)
        if (reading) readScale(copy, reading)
    })

/**
 * Puts the copy's features back where they were measured. A paper
 * stretch read off the alignment goes with it; a speed stated stays,
 * being a fact about the copy.
 */
export const unalignCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        revertScale(copy)
        revertShift(copy)
        copy.conditions = without(copy.conditions, isPaperStretch)
    })

/**
 * Takes the extension a pneumatic reader adds off the ends of the
 * copy's chains of holes, and records how much was taken, so that their lengths
 * can be compared with a scanned copy's at all.
 */
export const shortenCopy = (copyId: string, extension: Millimeters, leaving?: ReadonlySet<string>): EditionOp =>
    onCopy(copyId, copy => shortenChains(extension, copy, leaving))

/** Puts the reader's extension back on the copy's chains of holes. */
export const unshortenCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => revertShortening(copy))

/** States what the copy's features were read from, in place of any earlier statement. */
export const stateSource = (copyId: string, source: FeatureSource): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = source
    })

/** Takes back the statement, leaving the copy silent about its source again. */
export const clearSource = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = undefined
    })

/** Gives the copy the siglum it is referred to by, or takes it away where the siglum given is blank. */
export const nameCopy = (copyId: string, siglum: string): EditionOp =>
    onCopy(copyId, copy => {
        const trimmed = siglum.trim()
        if (trimmed) copy.siglum = trimmed
        else delete copy.siglum
    })

/** Takes out the copy's statements that match, and the list itself where none is left. */
export const dropStatements = (copy: Draft<RollCopy>, matches: (statement: Readonly<ReferenceAssumption>) => boolean) => {
    const statements = stateOf<RollCopy>(copy).carries
    if (!statements?.some(matches)) return
    const kept = withoutReferences(statements, matches)
    if (kept) copy.carries = kept
    else delete copy.carries
}

/**
 * States that the copy carries the version, under the belief given. It
 * is meant for a copy whose features are not read into symbols, such as
 * one known only from a recording, and `carriageProblems` reports it
 * where features carry symbols already. A second statement about one
 * version is none.
 */
export const stateCarriage = (copyId: string, versionId: string, belief?: Belief): EditionOp =>
    onCopy(copyId, copy => {
        const statements = stateOf<RollCopy>(copy).carries ?? []
        if (statements.some(statement => idOf(statement) === versionId)) return
        copy.carries = [...statements, referenceHeld(versionId, belief)]
    })

/** Takes back the copy's statement that it carries the version. */
export const clearCarriage = (copyId: string, versionId: string): EditionOp =>
    onCopy(copyId, copy => dropStatements(copy, statement => idOf(statement) === versionId))

/**
 * Adds a general condition to the copy, beside whatever is stated of it
 * already. The other condition a copy may be in, a paper stretch, is
 * read off an alignment and stated by `alignCopy`.
 */
export const addGeneralCondition = (copyId: string, condition: ObjectAssumption<GeneralRollCondition>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions.push(condition)
    })

/** The symbols of the versions that no other copy carries. */
export const symbolsCarriedOnlyBy = (edition: Edition, copyId: string): AnySymbol[] => {
    const copy = edition.copies.find(c => c.id === copyId)
    return copy ? insertedIn(edition.versions).filter(carriedOnlyOn(featureIdsOf(copy))) : []
}

/**
 * Takes the copy out of the edition together with the symbols only it
 * carries, and with every reference the versions and the argumentations
 * made to those symbols.
 */
export const removeCopy = (copyId: string): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        forgetFeatures(draft, featureIdsOf(copy))
        draft.copies = draft.copies.filter(c => c.id !== copyId)
    })
