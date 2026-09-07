import { Draft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt, Path } from "./EditionView"
import { Edition } from "./Edition"
import { AnyPerforation, AnySymbol, Expression, PlacementRelation, isPerforation, placementRelations } from "./Symbol"
import { CollationTolerance } from "./Collation"
import { Edit, EditType } from "./Edit"
import { Version } from "./Version"
import { applyShift, applyStretch, asSymbols, PaperStretch, revertShift, revertStretch, RollCopy, Shift } from "./RollCopy"
import { AnyArgumentation, Assumption, Belief, Certainty, ObjectAssumption, assignReference, idOf } from "./Assumption"

/**
 * A change to an edition, written onto an immer draft of it. One
 * operation is one undo step, so an operation that has to read the
 * edition first takes an `EditionView` of the state it will be
 * applied to and does all its writing in the one function it returns.
 */
export type EditionOp = (draft: Draft<Edition>) => void

const noChange: EditionOp = () => undefined

const onCopy = (copyId: string, op: (copy: Draft<RollCopy>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const copy = draft.copies.find(c => c.id === copyId)
        if (copy) op(copy, draft)
    }

const onVersion = (versionId: string, op: (version: Draft<Version>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (version) op(version, draft)
    }

/** The items that do not match, or the very same array when none does, so that a draft stays untouched. */
const without = <T,>(items: T[], matches: (item: T) => boolean): T[] =>
    items.some(matches) ? items.filter(item => !matches(item)) : items

type Ids = ReadonlySet<string>

const defaultTolerance: CollationTolerance = { toleranceStart: 5, toleranceEnd: 5 }

const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

const insertedIn = (versions: readonly Version[]): AnySymbol[] =>
    versions.flatMap(version => version.edits).flatMap(edit => edit.insert ?? [])

/** Runs the change over the version's edits and drops those it emptied, leaving edits that were empty before alone. */
const editing = (version: Draft<Version>, change: (edit: Draft<Edit>) => void) => {
    const emptyBefore = new Set(version.edits.filter(isEmpty).map(edit => edit.id))
    version.edits.forEach(change)
    version.edits = without(version.edits, edit => isEmpty(edit) && !emptyBefore.has(edit.id))
}

/** Takes the symbols out of the version's own insertions. */
const dropInsertions = (version: Draft<Version>, symbolIds: Ids) =>
    editing(version, edit => {
        if (edit.insert) edit.insert = without(edit.insert, symbol => symbolIds.has(symbol.id))
    })

/**
 * Puts the copy into the edition with a version of its own, which
 * inserts every symbol the tracker bar reads on the copy.
 */
export const createVersion = (siglum: string, copy: RollCopy): EditionOp =>
    draft => {
        draft.copies.push(copy)
        draft.versions.push({
            type: 'Version',
            id: v4(),
            siglum,
            versionType: 'edition',
            edits: asSymbols(copy.features).map(insertion),
            motivations: []
        })
    }

/** Shifts and then stretches the copy's features into line with another copy's. */
export const alignCopy = (copyId: string, shift: Shift, stretch: ObjectAssumption<PaperStretch>): EditionOp =>
    onCopy(copyId, copy => {
        applyShift(shift, copy)
        applyStretch(stretch, copy)
    })

/** Puts the copy's features back where they were measured. */
export const unalignCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        revertStretch(copy)
        revertShift(copy)
    })

const featureIdsOf = (copy: RollCopy): Ids => new Set(copy.features.map(feature => feature.id))

/**
 * A symbol every carrier of which lies among the features loses its
 * evidence with them. A symbol without carriers, such as a label,
 * stands on its own.
 */
const carriedOnlyOn = (features: Ids) => (symbol: AnySymbol): boolean =>
    symbol.carriers.length > 0 && symbol.carriers.every(carrier => features.has(idOf(carrier)))

/** The symbols of the versions that no other copy carries. */
export const symbolsCarriedOnlyBy = (edition: Edition, copyId: string): AnySymbol[] => {
    const copy = edition.copies.find(c => c.id === copyId)
    return copy ? insertedIn(edition.versions).filter(carriedOnlyOn(featureIdsOf(copy))) : []
}

const references = [...placementRelations, 'pairedWith'] as const

const forgetPerforations = (perforation: Draft<AnyPerforation>, dropped: Ids) =>
    references
        .filter(relation => {
            const reference = perforation[relation]
            return reference && dropped.has(idOf(reference))
        })
        .forEach(relation => { delete perforation[relation] })

const forgetCarriers = (symbol: Draft<AnySymbol>, features: Ids, dropped: Ids) => {
    symbol.carriers = without(symbol.carriers, carrier => features.has(idOf(carrier)))
    if (isPerforation(symbol)) forgetPerforations(symbol, dropped)
}

const forgetFeaturesInEdit = (edit: Draft<Edit>, features: Ids, dropped: Ids) => {
    if (edit.insert) {
        edit.insert = without(edit.insert, symbol => dropped.has(symbol.id))
        edit.insert.forEach(symbol => forgetCarriers(symbol, features, dropped))
    }
    if (edit.delete) {
        edit.delete = without(edit.delete, id => dropped.has(id))
    }
}

/**
 * Strikes the features from the versions: their carriers go, a symbol
 * that had no other carrier goes with them, and so does every
 * reference the versions made to such a symbol.
 */
const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const dropped = new Set(insertedIn(draft.versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    draft.versions.forEach(version =>
        editing(version, edit => forgetFeaturesInEdit(edit, features, dropped)))
}

/** Takes the features off the copy, and out of the versions with what only they carried. */
export const removeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const features = new Set(featureIds)
        copy.features = without(copy.features, feature => features.has(feature.id))
        forgetFeatures(draft, features)
    })

/**
 * Takes the copy out of the edition together with the symbols only it
 * carries, and with every reference the versions made to those symbols.
 */
export const removeCopy = (copyId: string): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        forgetFeatures(draft, featureIdsOf(copy))
        draft.copies = draft.copies.filter(c => c.id !== copyId)
    })

type Collation = { symbol: Readonly<AnySymbol>, counterpart: Readonly<AnySymbol> }

/** Each of the version's own symbols with every inherited symbol it collates with. */
const collationsOf = (
    view: EditionView,
    own: readonly Readonly<AnySymbol>[],
    inherited: readonly Readonly<AnySymbol>[],
    tolerance: CollationTolerance
): Collation[] =>
    own.flatMap(symbol =>
        inherited
            .filter(candidate => view.isCollatable(symbol, candidate, tolerance))
            .map(counterpart => ({ symbol, counterpart })))

/** The carriers of each collated symbol pass to its counterpart. */
const handOverCarriers = (view: EditionView, draft: Draft<Edition>, collations: readonly Collation[]) =>
    collations.forEach(({ symbol, counterpart }) => {
        const path = view.getPath(counterpart.id)
        const target = path && getAt<Draft<AnySymbol>>(path, draft)
        target?.carriers.push(...symbol.carriers)
    })

/**
 * Bases the child on the parent. A symbol of the child that collates
 * with one the parent hands down adds its carriers to that symbol; the
 * rest become the child's insertions, and what the parent hands down
 * and the child lacks becomes its deletions.
 */
export const connectVersions = (
    view: EditionView,
    childId: string,
    parentId: string,
    tolerance: CollationTolerance = defaultTolerance
): EditionOp => {
    const inherited = view.snapshot(parentId)
    const own = view.snapshot(childId)
    const collations = collationsOf(view, own, inherited, tolerance)
    const collated = new Set(collations.map(({ symbol }) => symbol.id))
    const matched = new Set(collations.map(({ counterpart }) => counterpart.id))

    const edits = [
        ...own.filter(symbol => !collated.has(symbol.id)).map(insertion),
        ...inherited.filter(symbol => !matched.has(symbol.id)).map(symbol => deletion(symbol.id))
    ]

    return onVersion(childId, (child, draft) => {
        handOverCarriers(view, draft, collations)
        child.edits = edits
        child.basedOn = assignReference(parentId)
    })
}

/**
 * Folds the version's own symbols into those it inherits and collates
 * with: the carriers pass over, and the insertions go.
 */
export const collateSymbols = (
    view: EditionView,
    versionId: string,
    symbolIds: readonly string[],
    tolerance: CollationTolerance = defaultTolerance
): EditionOp => {
    const version = view.get<Version>(versionId)
    if (!version?.basedOn) return noChange

    const chosen = new Set(symbolIds)
    const own = insertedIn([version]).filter(symbol => chosen.has(symbol.id))
    const collations = collationsOf(view, own, view.snapshot(idOf(version.basedOn)), tolerance)
    const collated = new Set(collations.map(({ symbol }) => symbol.id))

    return onVersion(versionId, (version, draft) => {
        handOverCarriers(view, draft, collations)
        dropInsertions(version, collated)
    })
}

/**
 * Makes the version stand on its own: what it inherited becomes its
 * own insertions, and the link to the version it was based on goes,
 * with the motivations that belonged to that derivation.
 */
export const detachVersion = (view: EditionView, versionId: string): EditionOp => {
    const edits = view.snapshot(versionId).map(insertion)

    return onVersion(versionId, version => {
        version.edits = edits
        delete version.basedOn
        version.motivations = []
    })
}

/** Takes the version out; whatever was based on it comes to stand on its own. */
export const removeVersion = (view: EditionView, versionId: string): EditionOp => {
    const detachments = view.edition.versions
        .filter(version => version.basedOn && idOf(version.basedOn) === versionId)
        .map(version => detachVersion(view, version.id))

    return draft => {
        detachments.forEach(detach => detach(draft))
        draft.versions = without(draft.versions, version => version.id === versionId)
    }
}

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
export const removeSymbols = (versionId: string, symbolIds: readonly string[]): EditionOp =>
    onVersion(versionId, version => dropInsertions(version, new Set(symbolIds)))

/** Moves the edits into a new version based on this one. */
export const deriveVersion = (versionId: string, editIds: readonly string[]): EditionOp =>
    onVersion(versionId, (version, draft) => {
        const chosen = new Set(editIds)
        const moved = version.edits.filter(edit => chosen.has(edit.id))
        version.edits = without(version.edits, edit => chosen.has(edit.id))
        draft.versions.push({
            type: 'Version',
            id: v4(),
            siglum: `${version.siglum}_derived`,
            versionType: 'unicum',
            basedOn: assignReference(versionId),
            edits: moved,
            motivations: []
        })
    })

const sameSequence = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i])

const expressionTypesOf = (symbols: readonly AnySymbol[]) =>
    symbols.filter((symbol): symbol is Expression => symbol.type === 'expression').map(symbol => symbol.expressionType)

const accents = [['SlowCrescendoOn', 'SlowCrescendoOff'], ['ForzandoOn', 'ForzandoOff']]

const lengthOf = (span: { from: number, to: number }) => span.to - span.from

/** Shorten or prolong, where the inserted symbol starts about where the deleted one did. */
const replacementType = (view: EditionView, inserted: AnySymbol, deleted: AnySymbol): EditType | undefined => {
    const after = view.dimensionOf(inserted)?.horizontal
    const before = view.dimensionOf(deleted)?.horizontal
    if (!after || !before || Math.abs(after.from - before.from) >= 5) return undefined

    return lengthOf(after) < lengthOf(before) ? 'shorten' : 'prolong'
}

/** A guess at what an edit does, from the symbols it exchanges. */
const guessEditType = (view: EditionView, edit: Edit): EditType => {
    const inserts = edit.insert ?? []
    const deletes = view.getAll<AnySymbol>(edit.delete ?? [])
    const inserted = expressionTypesOf(inserts)
    const deleted = expressionTypesOf(deletes)

    if (deleted.length === 0 && accents.some(accent => sameSequence(inserted, accent))) return 'additional-accent'
    if (inserted.length > 1 && sameSequence(inserted, deleted)) return 'shift'
    if (inserted.length === 0 && deleted.length === 1) return 'remove-redundancy'
    if (inserts.length === 1 && deletes.length === 1) return replacementType(view, inserts[0], deletes[0]) ?? 'correct-error'

    return 'correct-error'
}

/**
 * Replaces the edits with a single one carrying all their insertions
 * and deletions, classified by a guess at what the exchange does.
 */
export const mergeEdits = (view: EditionView, versionId: string, toMerge: readonly Edit[]): EditionOp => {
    if (toMerge.length === 0) return noChange

    const merged: Edit = {
        ...toMerge[0],
        id: v4(),
        insert: toMerge.flatMap(edit => edit.insert ?? []),
        delete: toMerge.flatMap(edit => edit.delete ?? [])
    }
    merged.editType = guessEditType(view, merged)
    const mergedIds = new Set(toMerge.map(edit => edit.id))

    return onVersion(versionId, version => {
        version.edits = [...version.edits.filter(edit => !mergedIds.has(edit.id)), merged]
    })
}

/** Replaces the edit with one edit per inserted and one per deleted symbol. */
export const splitEdit = (versionId: string, toSplit: Edit): EditionOp => {
    const parts = [
        ...(toSplit.insert ?? []).map(insertion),
        ...(toSplit.delete ?? []).map(deletion)
    ]

    return onVersion(versionId, version => {
        version.edits = [...version.edits.filter(edit => edit.id !== toSplit.id), ...parts]
    })
}

/**
 * Runs the change on the perforation the view locates by id, in whichever
 * version inserted it. A statement made there holds in every version
 * that carries the perforation.
 */
const onPerforation = (view: EditionView, id: string, op: (perforation: Draft<AnyPerforation>) => void): EditionOp =>
    draft => {
        const path = view.getPath(id)
        const symbol = path && getAt<Draft<AnySymbol>>(path, draft)
        if (isPerforation(symbol)) op(symbol)
    }

const clearPlacement = (perforation: Draft<AnyPerforation>) =>
    placementRelations.forEach(relation => { delete perforation[relation] })

/** States how the follower is placed relative to the reference, in place of any earlier statement. */
export const placePerforation = (
    view: EditionView,
    followerId: string,
    referenceId: string,
    relation: PlacementRelation
): EditionOp =>
    onPerforation(view, followerId, perforation => {
        clearPlacement(perforation)
        perforation[relation] = assignReference(referenceId)
    })

export const unplacePerforation = (view: EditionView, followerId: string): EditionOp =>
    onPerforation(view, followerId, clearPlacement)

/** The pair is stated on `statingId` only, as the format asks. */
export const pairPerforations = (view: EditionView, statingId: string, partnerId: string): EditionOp =>
    onPerforation(view, statingId, perforation => {
        perforation.pairedWith = assignReference(partnerId)
    })

export const unpairPerforation = (view: EditionView, statingId: string): EditionOp =>
    onPerforation(view, statingId, perforation => {
        delete perforation.pairedWith
    })

const onAssumptionAt = (path: Path, op: (assumption: Draft<Assumption>) => void): EditionOp =>
    draft => {
        const assumption = getAt<Draft<Assumption>>(path, draft)
        if (assumption) op(assumption)
    }

const onBeliefAt = (path: Path, op: (belief: Draft<Belief>) => void): EditionOp =>
    onAssumptionAt(path, assumption => {
        const belief = assumption['@annotation']?.belief
        if (belief) op(belief)
    })

/** Annotates the assumption at the path with a belief held true, for reasons to be added. */
export const createBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        assumption['@annotation'] = {
            id: v4(),
            belief: { type: 'belief', id: v4(), certainty: 'true', reasons: [] }
        }
    })

export const clearBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        delete assumption['@annotation']
    })

export const setCertainty = (path: Path, certainty: Certainty): EditionOp =>
    onBeliefAt(path, belief => {
        belief.certainty = certainty
    })

export const addReason = (path: Path, reason: AnyArgumentation): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.push(reason)
    })

export const removeReason = (path: Path, index: number): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.splice(index, 1)
    })
