import { current, Draft, isDraft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt, Path } from "./EditionView"
import { Edition } from "./Edition"
import { AnyPerforation, AnySymbol, Expression, PlacementRelation, isPerforation, placementRelations } from "./Symbol"
import { Collation, CollationTolerance, collationsOf, defaultCollationTolerance } from "./Collation"
import { Edit, EditType } from "./Edit"
import { insertedBy, Version } from "./Version"
import { asSymbols, RollConditionAssignment, RollCopy, ScaleReading, Shift } from "./RollCopy"
import { FeatureSource } from "./FeatureSource"
import { applyShift, applyScale, revertShift, revertScale } from "./alignment"
import { AnyArgumentation, Assumption, Belief, Certainty, ReferenceAssumption, assignReference, idOf } from "./Assumption"
import { AnyFeature, HorizontalSpan } from "./Feature"
import { distance, Millimeters, mm, subtract } from "./Quantity"

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

/**
 * The state a draft stands at, as plain data. Reading a draft proxies
 * everything it touches, so what is only read is read from this.
 */
const stateOf = <T,>(draft: Draft<T>): T => isDraft(draft) ? current(draft) : draft as T

/** The items that do not match, or the very same array when none does, so that a draft stays untouched. */
const without = <T,>(items: T[], matches: (item: T) => boolean): T[] =>
    items.some(matches) ? items.filter(item => !matches(item)) : items

/** The items each changed, or the very same array when the change left every one as it was. */
const mapped = <T,>(items: T[], change: (item: T) => T): T[] => {
    const changed = items.map(change)
    return changed.every((item, i) => item === items[i]) ? items : changed
}

type Ids = ReadonlySet<string>

const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

const insertedIn = (versions: readonly Version[]): AnySymbol[] => versions.flatMap(insertedBy)

/** The edits with the change applied, less those it emptied; the very same array where it changed none. */
const edited = (edits: Edit[], change: (edit: Edit) => Edit): Edit[] => {
    const changed = mapped(edits, change)
    return changed === edits ? edits : changed.filter((edit, i) => edit === edits[i] || !isEmpty(edit))
}

/** The edit without the symbols among its insertions, or the very same edit where it inserts none of them. */
const droppingInsertions = (symbolIds: Ids) => (edit: Edit): Edit => {
    const insert = edit.insert && without(edit.insert, symbol => symbolIds.has(symbol.id))
    return insert === edit.insert ? edit : { ...edit, insert }
}

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
const dropInsertions = (version: Draft<Version>, symbolIds: Ids) => {
    version.edits = edited(stateOf<Version>(version).edits, droppingInsertions(symbolIds))
}

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

const isPaperStretch = (condition: RollConditionAssignment): boolean =>
    condition.conditionType === 'paper-stretch'

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

/** The perforation without its references to the dropped symbols, or the very same one where it makes none. */
const forgettingReferences = (perforation: AnyPerforation, dropped: Ids): AnyPerforation => {
    const stale = references.filter(relation => {
        const reference = perforation[relation]
        return reference !== undefined && dropped.has(idOf(reference))
    })
    if (stale.length === 0) return perforation

    const kept = { ...perforation }
    stale.forEach(relation => { delete kept[relation] })
    return kept
}

/** The symbol without the features among its carriers, and without references to what went with them. */
const forgettingCarriers = (features: Ids, dropped: Ids) => (symbol: AnySymbol): AnySymbol => {
    const carriers = without(symbol.carriers, carrier => features.has(idOf(carrier)))
    const relieved: AnySymbol = carriers === symbol.carriers ? symbol : { ...symbol, carriers }
    return isPerforation(relieved) ? forgettingReferences(relieved, dropped) : relieved
}

/** The edit without the dropped symbols and the features, or the very same edit where it had none of them. */
const forgettingFeatures = (features: Ids, dropped: Ids) => {
    const forgetCarriers = forgettingCarriers(features, dropped)
    return (edit: Edit): Edit => {
        const insert = edit.insert && mapped(without(edit.insert, symbol => dropped.has(symbol.id)), forgetCarriers)
        const deleted = edit.delete && without(edit.delete, id => dropped.has(id))
        if (insert === edit.insert && deleted === edit.delete) return edit
        return { ...edit, ...(insert && { insert }), ...(deleted && { delete: deleted }) }
    }
}

/**
 * Strikes the features from the versions: their carriers go, a symbol
 * that had no other carrier goes with them, and so does every
 * reference the versions made to such a symbol.
 */
const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const versions = stateOf<Version[]>(draft.versions)
    const dropped = new Set(insertedIn(versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    const forget = forgettingFeatures(features, dropped)
    draft.versions.forEach((version, i) => {
        version.edits = edited(versions[i].edits, forget)
    })
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

/**
 * Whether two records of the edition state the same, the identity of a
 * statement left out: two transcriptions reading the same word say the
 * same, whichever ids they were given.
 */
const sayTheSame = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (!isRecord(a) || !isRecord(b) || Array.isArray(a) !== Array.isArray(b)) return false

    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    keys.delete('id')
    return [...keys].every(key => sayTheSame(a[key], b[key]))
}

/** What a feature states beyond its identity, its place along the roll, its depiction and its condition. */
const nature = (feature: AnyFeature): object => {
    const { id, horizontal, depiction, condition, ...rest } = feature
    return rest
}

const conditionsOf = (features: readonly AnyFeature[]) =>
    features.flatMap(feature => feature.condition ? [feature.condition] : [])

/** Why several features cannot be replaced by one. */
export type MergeObstacle =
    | 'fewer-than-two'
    | 'different-types'
    | 'different-tracks'
    | 'differing-conditions'
    | 'unlike-features'

/**
 * What stands in the way of reading the features as one, or nothing
 * where they may be merged. Features may be merged where they differ
 * in nothing but their place along the roll, their depiction and the
 * condition at most one of them states. How far apart they lie is not
 * asked: whether a gap is a bridge of the perforator, a tear or two
 * perforations of their own is the editor's reading.
 */
export const mergeObstacle = (features: readonly AnyFeature[]): MergeObstacle | undefined => {
    if (features.length < 2) return 'fewer-than-two'

    const [first, ...rest] = features
    if (rest.some(feature => feature.type !== first.type)) return 'different-types'
    if (rest.some(feature => !sayTheSame(feature.vertical, first.vertical))) return 'different-tracks'
    if (rest.some(feature => !sayTheSame(nature(feature), nature(first)))) return 'unlike-features'

    const conditions = conditionsOf(features)
    if (conditions.some(condition => !sayTheSame(condition, conditions[0]))) return 'differing-conditions'

    return undefined
}

/** The items with the replacement in the place of the first it stands for, the others dropped. */
const standingFor = <T,>(items: T[], stands: (item: T) => boolean, replacement: T): T[] => {
    const first = items.findIndex(stands)
    if (first < 0) return items

    return items.flatMap((item, i) => i === first ? [replacement] : stands(item) ? [] : [item])
}

const spanning = (features: readonly AnyFeature[]): HorizontalSpan => ({
    unit: 'mm',
    from: mm(Math.min(...features.map(feature => feature.horizontal.from))),
    to: mm(Math.max(...features.map(feature => feature.horizontal.to)))
})

/**
 * The feature the merged ones give way to. It spans them all and is in
 * every other respect the one of them that states a condition, the
 * others being alike in all but their place. The depiction goes: a
 * region of the scan showing one part depicts no more than that part.
 */
const mergedFrom = (features: readonly AnyFeature[]): AnyFeature => {
    const stating = features.find(feature => feature.condition) ?? features[0]
    const merged: AnyFeature = { ...stating, id: v4(), horizontal: spanning(features) }
    delete merged.depiction
    return merged
}

/** The symbol carried by the merged feature where it named one of those it replaces, and naming it once. */
const carriedByMerged = (replaced: Ids, mergedId: string) => (symbol: AnySymbol): AnySymbol => {
    const names = (carrier: ReferenceAssumption) => replaced.has(idOf(carrier))
    const first = symbol.carriers.find(names)
    if (!first) return symbol

    return { ...symbol, carriers: standingFor(symbol.carriers, names, { ...first, id: mergedId }) }
}

/** Points the versions at the merged feature wherever they name one it replaces. */
const carryOver = (draft: Draft<Edition>, replaced: Ids, mergedId: string) => {
    const recarry = carriedByMerged(replaced, mergedId)
    const recarrying = (edit: Edit): Edit => {
        const insert = edit.insert && mapped(edit.insert, recarry)
        return insert === edit.insert ? edit : { ...edit, insert }
    }

    const versions = stateOf<Version[]>(draft.versions)
    draft.versions.forEach((version, i) => {
        version.edits = mapped(versions[i].edits, recarrying)
    })
}

/**
 * Replaces the features of the copy with a single one covering them
 * all, where a scan has split what the editor reads as one feature.
 * The merged feature takes the place of the first it replaces and
 * spans from the first to the last, any gap between them included.
 * What the replaced features carried is carried by the merged one.
 *
 * Throws where the features cannot stand for one; `mergeObstacle`
 * says beforehand whether they can.
 */
export const mergeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const replaced = new Set(featureIds)
        const isReplaced = (feature: AnyFeature) => replaced.has(feature.id)
        const features = stateOf<AnyFeature[]>(copy.features)
        const toMerge = features.filter(isReplaced)

        const obstacle = mergeObstacle(toMerge)
        if (obstacle) {
            throw new Error(`The features of copy ${copyId} cannot be merged: ${obstacle}`)
        }

        const merged = mergedFrom(toMerge)
        copy.features = standingFor(features, isReplaced, merged)
        carryOver(draft, replaced, merged.id)
    })

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
    tolerance: CollationTolerance = defaultCollationTolerance
): EditionOp => {
    const inherited = view.snapshot(parentId)
    const own = view.snapshot(childId)
    const collations = collationsOf(own, inherited, symbol => view.dimensionOf(symbol), tolerance)
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
    tolerance: CollationTolerance = defaultCollationTolerance
): EditionOp => {
    const version = view.get<Version>(versionId)
    if (!version?.basedOn) return noChange

    const chosen = new Set(symbolIds)
    const own = insertedIn([version]).filter(symbol => chosen.has(symbol.id))
    const collations = collationsOf(own, view.snapshot(idOf(version.basedOn)), symbol => view.dimensionOf(symbol), tolerance)
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

const lengthOf = (span: HorizontalSpan): Millimeters => subtract(span.to, span.from)

/** How far apart two onsets may lie for the one symbol to count as a replacement of the other. */
const REPLACEMENT_TOLERANCE = mm(5)

/** Shorten or prolong, where the inserted symbol starts about where the deleted one did. */
const replacementType = (view: EditionView, inserted: AnySymbol, deleted: AnySymbol): EditType | undefined => {
    const after = view.dimensionOf(inserted)?.horizontal
    const before = view.dimensionOf(deleted)?.horizontal
    if (!after || !before || distance(after.from, before.from) >= REPLACEMENT_TOLERANCE) return undefined

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
