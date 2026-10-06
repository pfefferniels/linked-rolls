/** Operations on the copies: adding and aligning them, and what they state of their source, their carriage and their condition. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { Edition, referenceCopyOf } from "../model/Edition.js"
import { AnySymbol } from "../model/Symbol.js"
import { Alignment, asSymbols, barOf, featuresOf, GeneralRollCondition, isPaperStretch, PaperStretch, RollCopy, Tear } from "../model/RollCopy.js"
import { systemOf } from "../systems/TrackerBar.js"
import { FeatureSource } from "../model/FeatureSource.js"
import { alignFeatures, ALIGNMENT_METHOD, applyAlignment, ownFeaturesOf, revertAlignment, revertShortening, shortenChains } from "../collation/alignment.js"
import { Belief, ObjectAssumption, ReferenceAssumption, idOf } from "../model/Assumption.js"
import { Millimeters, track } from "../model/Quantity.js"
import { EditionOp, onCopy, stateOf, insertion, insertedIn, referenceHeld, withoutReferences } from "./draft.js"
import { without } from "./immutable.js"
import { featureIdsOf, carriedOnlyOn, forgetFeatures } from "./forget.js"

/**
 * Puts the copy into the edition with a version of its own, which
 * inserts every symbol the copy's own tracker bar reads on it. The
 * version is a reading in that system's words, so it is coded for the
 * system the copy was cut for.
 * @category Operations
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
 * @category Operations
 */
export const addCopy = (copy: RollCopy): EditionOp =>
    draft => {
        draft.copies.push(copy)
    }

/**
 * What aligning the copy with the reference copy finds, or nothing
 * where the two share no run of notes, where there is no reference
 * copy, or where the copy is the reference itself. The copy is read at
 * its own places whatever alignment it has, and through its own bar,
 * which is what lets a copy cut for another system be aligned at all.
 * @category Operations
 */
export const alignmentFor = (edition: Edition, copy: RollCopy, date: Date = new Date()): Alignment | undefined => {
    const reference = referenceCopyOf(edition)
    if (!reference || reference.id === copy.id) return undefined

    const found = alignFeatures(ownFeaturesOf(copy), featuresOf(reference), barOf(copy), barOf(reference))
    if (!found) return undefined

    return {
        against: reference.id,
        shift: { horizontal: found.shift, vertical: track(0) },
        scale: found.scale,
        matched: found.matched,
        residual: found.residual,
        scaleError: found.scaleError,
        foundBy: { ...ALIGNMENT_METHOD, date }
    }
}

/**
 * Aligns the copy with the edition's reference copy: finds the shift
 * and scale that carry its notes onto the reference copy's, and puts
 * its features and tears onto the axis by them, in place of any
 * alignment it had. A copy that shares no run of notes with the
 * reference copy is left as it was.
 * @category Operations
 */
export const alignCopy = (copyId: string, date: Date = new Date()): EditionOp =>
    draft => {
        const state = stateOf<Edition>(draft)
        const copy = state.copies.find(c => c.id === copyId)
        const alignment = copy && alignmentFor(state, copy, date)
        const target = draft.copies.find(c => c.id === copyId)
        if (alignment && target) applyAlignment(alignment, target)
    }

/**
 * Aligns every copy that has features with the reference copy, as
 * `alignCopy` does one. The reference copy itself is taken off any
 * alignment it had, its places being the axis.
 * @category Operations
 */
export const alignCopies = (date: Date = new Date()): EditionOp =>
    draft => {
        const reference = referenceCopyOf(stateOf<Edition>(draft))
        if (!reference) return

        const own = draft.copies.find(c => c.id === reference.id)
        if (own) revertAlignment(own)

        // Aligning a copy moves neither the reference copy nor any other,
        // so every copy is aligned from the one state. Read afresh after
        // each, the draft would be copied with every copy aligned so far.
        const state = stateOf<Edition>(draft)
        state.copies.forEach((copy, i) => {
            if (copy.id === reference.id || featuresOf(copy).length === 0) return
            const alignment = alignmentFor(state, copy, date)
            if (alignment) applyAlignment(alignment, draft.copies[i])
        })
    }

/**
 * Makes the copy the one whose millimetres are the edition's axis, and
 * aligns every other copy onto it. Every place the edition gives along
 * the roll moves with this, which is why it is a choice and not
 * something worked out.
 * @category Operations
 */
export const chooseReferenceCopy = (copyId: string, date: Date = new Date()): EditionOp =>
    draft => {
        if (!draft.copies.some(copy => copy.id === copyId)) return
        draft.referenceCopy = copyId
        alignCopies(date)(draft)
    }

/**
 * Puts the copy's features back where they were measured, off the
 * axis. What the alignments say about the paper goes with it, since
 * that is worked out from them.
 * @category Operations
 */
export const unalignCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        revertAlignment(copy)
    })

/**
 * Takes the extension a pneumatic reader adds off the ends of the
 * copy's chains of holes, and records how much was taken, so that their lengths
 * can be compared with a scanned copy's at all.
 * @category Operations
 */
export const shortenCopy = (copyId: string, extension: Millimeters, leaving?: ReadonlySet<string>): EditionOp =>
    onCopy(copyId, copy => shortenChains(extension, copy, leaving))

/**
 * Puts the reader's extension back on the copy's chains of holes.
 * @category Operations
 */
export const unshortenCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => revertShortening(copy))

/**
 * States what the copy's features were read from, in place of any earlier statement.
 * @category Operations
 */
export const stateSource = (copyId: string, source: FeatureSource): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = source
    })

/**
 * Takes back the statement, leaving the copy silent about its source again.
 * @category Operations
 */
export const clearSource = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = undefined
    })

/**
 * Gives the copy the siglum it is referred to by, or takes it away where the siglum given is blank.
 * @category Operations
 */
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
 * @category Operations
 */
export const stateCarriage = (copyId: string, versionId: string, belief?: Belief): EditionOp =>
    onCopy(copyId, copy => {
        const statements = stateOf<RollCopy>(copy).carries ?? []
        if (statements.some(statement => idOf(statement) === versionId)) return
        copy.carries = [...statements, referenceHeld(versionId, belief)]
    })

/**
 * Takes back the copy's statement that it carries the version.
 * @category Operations
 */
export const clearCarriage = (copyId: string, versionId: string): EditionOp =>
    onCopy(copyId, copy => dropStatements(copy, statement => idOf(statement) === versionId))

/**
 * Adds a general condition to the copy, beside whatever is stated of it
 * already. A paper stretch is added the same way, where one was
 * measured; what the alignments say of the paper is worked out from
 * them and stated nowhere.
 * @category Operations
 */
export const addGeneralCondition = (copyId: string, condition: ObjectAssumption<GeneralRollCondition>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions.push(condition)
    })

/**
 * States what the copy's paper was measured to have done, in place of
 * what was stated before; given nothing, it takes the statement away. A
 * copy has one paper, so it has one such condition, which may give a
 * strain in either direction.
 * @category Operations
 */
export const statePaperStretch = (copyId: string, stretch?: ObjectAssumption<PaperStretch>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions = [...without(copy.conditions, isPaperStretch), ...(stretch ? [stretch] : [])]
    })

/**
 * Adds a tear to the copy, beside whatever is stated of it already. The
 * tear is given on the axis, where the copy's features stand, and moves
 * with them from then on.
 * @category Operations
 */
export const addTear = (copyId: string, tear: ObjectAssumption<Tear>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions.push(tear)
    })

/**
 * The symbols of the versions that no other copy carries.
 * @category Operations
 */
export const symbolsCarriedOnlyBy = (edition: Edition, copyId: string): AnySymbol[] => {
    const copy = edition.copies.find(c => c.id === copyId)
    return copy ? insertedIn(edition.versions).filter(carriedOnlyOn(featureIdsOf(copy))) : []
}

/**
 * Takes the copy out of the edition together with the symbols only it
 * carries, and with every reference the versions and the argumentations
 * made to those symbols.
 * @category Operations
 */
export const removeCopy = (copyId: string): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        forgetFeatures(draft, featureIdsOf(copy))
        draft.copies = draft.copies.filter(c => c.id !== copyId)
        if (draft.referenceCopy === copyId) delete draft.referenceCopy
    })
