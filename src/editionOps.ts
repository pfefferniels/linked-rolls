import { current, Draft, isDraft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt, Path } from "./EditionView"
import { Edition } from "./Edition"
import { AnyPerforation, AnySymbol, Expression, PlacementRelation, isPerforation, placementRelations } from "./Symbol"
import { Collation, CollationTolerance, collationsOf, defaultCollationTolerance } from "./Collation"
import { Edit, EditType } from "./Edit"
import { collationToleranceOf, insertedBy, Version } from "./Version"
import { asSymbols, barOf, GeneralRollCondition, isPaperStretch, Modification, RollCopy, ScaleReading, Shift } from "./RollCopy"
import { systemOf, TrackerBar } from "./TrackerBar"
import { trackerBarOf } from "./systems"
import { FeatureSource } from "./FeatureSource"
import { applyShift, applyScale, revertShift, revertScale } from "./alignment"
import {
    AnyArgumentation, Assumption, Belief, Certainty, MeaningComprehension, ObjectAssumption, ReferenceAssumption,
    assignReference, idOf
} from "./Assumption"
import {
    AnyFeature, FeatureConditionAssignment, FeatureConditionType, HorizontalSpan, NestedFeature,
    conditions as conditionsAllowed, featuresBorneBy, isGluedOn, withBorneFeatures
} from "./Feature"
import { distance, Millimeters, mm, subtract } from "./Quantity"
import { WithId } from "./utils"

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

const onFeature = (copyId: string, featureId: string, op: (feature: Draft<AnyFeature>) => void): EditionOp =>
    onCopy(copyId, copy => {
        const feature = copy.features.find(f => f.id === featureId)
        if (feature) op(feature)
    })

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

/** The items each changed, less those the change emptied; the very same array where it changed none. */
const pruned = <T,>(items: T[], change: (item: T) => T, emptied: (item: T) => boolean): T[] => {
    const changed = mapped(items, change)
    return changed === items ? items : changed.filter((item, i) => item === items[i] || !emptied(item))
}

/** The record with the field replaced, or the very same record where that is what stood there. */
const replacing = <T extends object, K extends keyof T>(record: T, key: K, value: T[K]): T =>
    record[key] === value ? record : { ...record, [key]: value }

/** The ids of the items the rewriting left out. */
const droppedIds = (before: readonly WithId[], after: readonly WithId[]): string[] => {
    const kept = new Set(after.map(item => item.id))
    return before.flatMap(item => kept.has(item.id) ? [] : [item.id])
}

type Ids = ReadonlySet<string>

const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

const insertedIn = (versions: readonly Version[]): AnySymbol[] => versions.flatMap(insertedBy)

/** The edits with the change applied, less those it emptied; the very same array where it changed none. */
const edited = (edits: Edit[], change: (edit: Edit) => Edit): Edit[] => pruned(edits, change, isEmpty)

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
 * inserts every symbol the copy's own tracker bar reads on it. The
 * version is a reading in that system's words, so it is coded for the
 * system the copy was cut for.
 */
export const createVersion = (siglum: string, copy: RollCopy): EditionOp =>
    draft => {
        const bar = barOf(copy)
        draft.copies.push(copy)
        draft.versions.push({
            type: 'Version',
            id: v4(),
            siglum,
            system: systemOf(bar),
            versionType: 'edition',
            edits: asSymbols(copy.features, bar).map(insertion),
            motivations: []
        })
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

/**
 * Adds a general condition to the copy, beside whatever is stated of it
 * already. The other condition a copy may be in, a paper stretch, is
 * read off an alignment and stated by `alignCopy`.
 */
export const addGeneralCondition = (copyId: string, condition: ObjectAssumption<GeneralRollCondition>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions.push(condition)
    })

/**
 * Whether the feature's own kind allows a condition of this kind. The
 * type narrowed to is the weaker statement, holding of a condition any
 * kind of feature may be in.
 */
const allows = (feature: AnyFeature, condition: FeatureConditionAssignment):
    condition is NonNullable<AnyFeature['condition']> => {
    const allowed: readonly FeatureConditionType[] = conditionsAllowed[feature.type]
    return allowed.includes(condition.conditionType)
}

/**
 * States the condition of the feature, in place of any earlier
 * statement. Throws where the kind of feature is in no such condition;
 * `conditions` says which conditions each kind of feature may be in.
 */
export const stateFeatureCondition = (
    copyId: string,
    featureId: string,
    condition: FeatureConditionAssignment
): EditionOp =>
    onFeature(copyId, featureId, feature => {
        if (!allows(feature, condition)) {
            throw new Error(`A ${feature.type} is in no '${condition.conditionType}' condition`)
        }
        feature.condition = condition
    })

/** The ids of every feature the copy bears, those a patch bears among them. */
const featureIdsOf = (copy: RollCopy): Ids =>
    new Set(copy.features.flatMap(withBorneFeatures).map(feature => feature.id))

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

/** A record of the edition, as the walk over it sees one. */
type Node = Record<string, unknown>

const isRecord = (value: unknown): value is Node =>
    typeof value === 'object' && value !== null

/** The record's values each changed, or the very same record where the change left every one as it was. */
const withValues = (record: Node, change: (value: unknown) => unknown): Node => {
    const entries = Object.entries(record)
    const changed = entries.map(([key, value]): [string, unknown] => [key, change(value)])
    return changed.every(([, value], i) => value === entries[i][1]) ? record : Object.fromEntries(changed)
}

/** The value with the change applied to every record within it and then to itself, innermost first. */
const deeply = (change: (record: object) => object) => {
    const changed = (value: unknown): unknown =>
        Array.isArray(value) ? mapped(value as unknown[], changed)
            : isRecord(value) ? change(withValues(value, changed))
                : value
    return changed
}

/** Whether the two stand alike, so that what differs within them can be written where it lies. */
const alike = (before: unknown, after: unknown): boolean => {
    if (!isRecord(before) || !isRecord(after)) return false
    if (Array.isArray(before)) return Array.isArray(after) && before.length === after.length
    return !Array.isArray(after)
}

/** Writes onto the draft what the rewriting changed, as deep as the change reaches. */
const writeInto = (draft: Node, before: Node, after: Node) =>
    Object.entries(after).forEach(([key, value]) => {
        if (value === before[key]) return
        if (alike(before[key], value)) writeInto(draft[key] as Node, before[key] as Node, value as Node)
        else draft[key] = value
    })

/** The ids a statement names, as the rewriting leaves them. */
type Rename = (ids: string[]) => string[]

const isCopy = (record: object): record is RollCopy =>
    'type' in record && record.type === 'RollCopy'

const isBelief = (record: object): record is Belief =>
    'type' in record && record.type === 'belief'

const isComprehension = (reason: AnyArgumentation): reason is MeaningComprehension =>
    reason.type === 'meaningComprehension'

/** What the modification names, be it as added or as removed. */
const membersOf = (modification: Modification): string[] =>
    modification.type === 'Addition' ? modification.added : modification.removed

const namesNothing = (modification: Modification): boolean => membersOf(modification).length === 0

const comprehendsNothing = (reason: AnyArgumentation): boolean =>
    isComprehension(reason) && reason.comprehends.length === 0

/** The modification with what it names rewritten, or the very same one where that leaves it as it was. */
const renamingMembers = (rename: Rename) => (modification: Modification): Modification =>
    modification.type === 'Addition'
        ? replacing(modification, 'added', rename(modification.added))
        : replacing(modification, 'removed', rename(modification.removed))

/** The reason with what a comprehension comprehends rewritten; any other reason names nothing of the kind. */
const renamingComprehended = (rename: Rename) => (reason: AnyArgumentation): AnyArgumentation =>
    isComprehension(reason) ? replacing(reason, 'comprehends', rename(reason.comprehends)) : reason

/**
 * The record with the ids it names rewritten: what a copy's
 * modifications added or removed, and what the comprehensions among a
 * belief's reasons comprehend. A modification or a comprehension the
 * rewriting emptied goes with what it named; one that named nothing
 * before stays, as an edit that was empty before it does.
 */
const renaming = (rename: Rename) => (record: object): object => {
    if (isCopy(record)) {
        return replacing(record, 'modifications',
            pruned(record.modifications, renamingMembers(rename), namesNothing))
    }
    if (isBelief(record)) {
        return replacing(record, 'reasons',
            pruned(record.reasons, renamingComprehended(rename), comprehendsNothing))
    }
    return record
}

/**
 * Rewrites the ids by which the edition names features and symbols
 * outside the versions. A belief is annotatable anywhere, so the whole
 * edition is read; what the rewriting leaves alone is left the very
 * object it was.
 */
const renameReferences = (draft: Draft<Edition>, rename: Rename) => {
    const before = stateOf<Edition>(draft) as unknown as Node
    const after = deeply(renaming(rename))(before) as Node
    if (after !== before) writeInto(draft as unknown as Node, before, after)
}

/**
 * Strikes the features from the edition: their carriers go, a symbol
 * that had no other carrier goes with them, an edit left exchanging
 * nothing goes as well, and so does every reference the versions, the
 * modifications of the copies and the comprehensions made to what went.
 */
const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const versions = stateOf<Version[]>(draft.versions)
    const dropped = new Set(insertedIn(versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    const forget = forgettingFeatures(features, dropped)
    const edits = versions.map(version => edited(version.edits, forget))
    const gone = new Set([
        ...features,
        ...dropped,
        ...versions.flatMap((version, i) => droppedIds(version.edits, edits[i]))
    ])

    renameReferences(draft, ids => without(ids, id => gone.has(id)))
    draft.versions.forEach((version, i) => {
        version.edits = edits[i]
    })
}

/**
 * The ids of the features named and of everything they bear: a feature
 * of a patch stands nowhere once the patch is gone.
 */
const goneWith = (features: readonly NestedFeature[], named: Ids): string[] =>
    features.flatMap(feature => named.has(feature.id)
        ? withBorneFeatures(feature).map(borne => borne.id)
        : goneWith(featuresBorneBy(feature), named))

/** The feature with the named ones gone from what it bears, or the very same one where it bears none of them. */
const withoutBorne = <T extends NestedFeature>(feature: T, named: Ids): T => {
    if (!isGluedOn(feature) || !feature.features) return feature

    const borne = withoutFeatures(feature.features, named)
    return borne === feature.features ? feature : { ...feature, features: borne }
}

/** The features without those named, wherever they lie, and without whatever those bore. */
const withoutFeatures = <T extends NestedFeature>(features: T[], named: Ids): T[] =>
    mapped(without(features, feature => named.has(feature.id)), feature => withoutBorne(feature, named))

/**
 * Takes the features off the copy, and out of the versions with what
 * only they carried. A feature may be named wherever the copy bears it:
 * a patch goes with everything glued onto it, and a feature of a patch
 * may be taken back on its own, the patch staying where it is.
 */
export const removeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const named = new Set(featureIds)
        const features = stateOf<AnyFeature[]>(copy.features)
        copy.features = withoutFeatures(features, named)
        forgetFeatures(draft, new Set(goneWith(features, named)))
    })

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

/**
 * What a feature states beyond its identity, its place along the roll,
 * its depiction and its condition. What a patch bears counts by
 * identity: two patches bear the same only where they bear the very
 * same features, so that no merge takes a feature of a patch away.
 */
const nature = (feature: AnyFeature): object => {
    const { id, horizontal, depiction, condition, ...rest } = feature
    return isGluedOn(feature) && feature.features
        ? { ...rest, features: feature.features.map(borne => borne.id) }
        : rest
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
 * What the replaced features carried is carried by the merged one, and
 * whatever else named them, a modification or a comprehension, names
 * the merged one in their stead.
 *
 * Only the features the copy bears itself are merged. A feature of a
 * patch states no place along the roll of its own, so there is nothing
 * for a merge to span, and an id naming one is passed over as an id the
 * copy does not bear is.
 *
 * Throws where the features cannot stand for one; `mergeObstacle`
 * says beforehand whether they can.
 */
export const mergeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const named = new Set(featureIds)
        const features = stateOf<AnyFeature[]>(copy.features)
        const toMerge = features.filter(feature => named.has(feature.id))

        const obstacle = mergeObstacle(toMerge)
        if (obstacle) {
            throw new Error(`The features of copy ${copyId} cannot be merged: ${obstacle}`)
        }

        const replaced = new Set(toMerge.map(feature => feature.id))
        const merged = mergedFrom(toMerge)
        copy.features = standingFor(features, feature => replaced.has(feature.id), merged)
        carryOver(draft, replaced, merged.id)
        renameReferences(draft, ids => standingFor(ids, id => replaced.has(id), merged.id))
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
 * and the child lacks becomes its deletions. The derivation states the
 * tolerance it was collated at.
 */
export const connectVersions = (
    view: EditionView,
    childId: string,
    parentId: string,
    tolerance: CollationTolerance = defaultCollationTolerance
): EditionOp => {
    const inherited = view.snapshot(parentId)
    const own = view.snapshot(childId)
    const collations = collationsOf(own, inherited, symbol => view.placeOf(symbol), tolerance)
    const collated = new Set(collations.map(({ symbol }) => symbol.id))
    const matched = new Set(collations.map(({ counterpart }) => counterpart.id))

    const edits = [
        ...own.filter(symbol => !collated.has(symbol.id)).map(insertion),
        ...inherited.filter(symbol => !matched.has(symbol.id)).map(symbol => deletion(symbol.id))
    ]

    return onVersion(childId, (child, draft) => {
        handOverCarriers(view, draft, collations)
        child.edits = edits
        child.basedOn = { ...assignReference(parentId), collationTolerance: tolerance }
    })
}

/**
 * Folds the version's own symbols into those it inherits and collates
 * with: the carriers pass over, and the insertions go. Collates at the
 * tolerance of the derivation, where the caller names none.
 */
export const collateSymbols = (
    view: EditionView,
    versionId: string,
    symbolIds: readonly string[],
    tolerance?: CollationTolerance
): EditionOp => {
    const version = view.get<Version>(versionId)
    if (!version?.basedOn) return noChange

    const chosen = new Set(symbolIds)
    const own = insertedIn([version]).filter(symbol => chosen.has(symbol.id))
    const collations = collationsOf(
        own,
        view.snapshot(idOf(version.basedOn)),
        symbol => view.placeOf(symbol),
        tolerance ?? collationToleranceOf(version.basedOn))
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
            system: stateOf<Version>(version).system,
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

/**
 * How a single added accent is spelled. The red Welte latches a valve
 * on and off again, the green holds one perforation for as long as the
 * accent lasts, so the spelling is the system's and not the music's.
 * Which of them a bar can spell decides which ones it is offered.
 */
const ACCENTS = [
    ['SlowCrescendoOn', 'SlowCrescendoOff'],
    ['ForzandoOn', 'ForzandoOff'],
    ['Crescendo'],
    ['SforzandoForte']
]

const accentsOn = (bar: TrackerBar | undefined): string[][] =>
    bar ? ACCENTS.filter(accent => accent.every(type => bar.expressionTypes.includes(type))) : []

const lengthOf = (span: HorizontalSpan): Millimeters => subtract(span.to, span.from)

/** How far apart two onsets may lie for the one symbol to count as a replacement of the other. */
const REPLACEMENT_TOLERANCE = mm(5)

/** Shorten or prolong, where the inserted symbol starts about where the deleted one did. */
const replacementType = (view: EditionView, inserted: AnySymbol, deleted: AnySymbol): EditType | undefined => {
    const after = view.placeOf(inserted)
    const before = view.placeOf(deleted)
    if (!after || !before || distance(after.from, before.from) >= REPLACEMENT_TOLERANCE) return undefined

    return lengthOf(after) < lengthOf(before) ? 'shorten' : 'prolong'
}

/**
 * A guess at what an edit does, from the symbols it exchanges and from
 * the systems the version and the one it is based on are coded for.
 */
const guessEditType = (view: EditionView, versionId: string, edit: Edit): EditType => {
    const inserts = edit.insert ?? []
    const deletes = view.getAll<AnySymbol>(edit.delete ?? [])
    const inserted = expressionTypesOf(inserts)
    const deleted = expressionTypesOf(deletes)

    const bar = trackerBarOf(view.get<Version>(versionId)?.system)
    const parentBar = trackerBarOf(view.predecessorOf(versionId)?.system)

    /**
     * Where the version is coded for another system than its parent, an
     * exchange of expression matter is the transfer being carried out:
     * a red ForzandoOn and ForzandoOff pair giving way to one held green
     * SforzandoForte says the same thing in the other system's words,
     * which is what 'replace-with-equivalent' is for. Calling it a
     * corrected error would say the editor made a mistake.
     */
    if (bar && parentBar && bar.id !== parentBar.id && inserted.length > 0 && deleted.length > 0) {
        return 'replace-with-equivalent'
    }

    if (deleted.length === 0 && accentsOn(bar).some(accent => sameSequence(inserted, accent))) return 'additional-accent'
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
    merged.editType = guessEditType(view, versionId, merged)
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
