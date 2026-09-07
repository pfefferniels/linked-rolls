import { Draft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt } from "./EditionView"
import { Edition } from "./Edition"
import { AnySymbol, Expression, Note, isPerforation, placementRelations } from "./Symbol"
import { CollationTolerance } from "./Collation"
import { Edit, EditType } from "./Edit"
import { Version } from "./Version"
import { asSymbols, RollCopy } from "./RollCopy"
import { assignReference, idOf } from "./Assumption"

/**
 * A change to an edition, written onto an immer draft of it. One
 * operation is one undo step, so an operation that has to read the
 * edition first takes an `EditionView` of the state it will be
 * applied to and does all its writing in the one function it returns.
 */
export type EditionOp = (draft: Draft<Edition>) => void

const defaultTolerance: CollationTolerance = { toleranceStart: 5, toleranceEnd: 5 }

const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

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

    const collations = own.flatMap(symbol =>
        inherited
            .filter(candidate => view.isCollatable(symbol, candidate, tolerance))
            .map(counterpart => ({ symbol, counterpart })))
    const collated = new Set(collations.map(({ symbol }) => symbol.id))
    const matched = new Set(collations.map(({ counterpart }) => counterpart.id))

    const edits = [
        ...own.filter(symbol => !collated.has(symbol.id)).map(insertion),
        ...inherited.filter(symbol => !matched.has(symbol.id)).map(symbol => deletion(symbol.id))
    ]

    return draft => {
        const child = draft.versions.find(v => v.id === childId)
        if (!child) return

        collations.forEach(({ symbol, counterpart }) => {
            const path = view.getPath(counterpart.id)
            const target = path && getAt<Draft<AnySymbol>>(path, draft)
            target?.carriers.push(...symbol.carriers)
        })
        child.edits = edits
        child.basedOn = assignReference(parentId)
    }
}

/**
 * Makes the version stand on its own: what it inherited becomes its
 * own insertions, and the link to the version it was based on goes,
 * with the motivations that belonged to that derivation.
 */
export const detachVersion = (view: EditionView, versionId: string): EditionOp => {
    const edits = view.snapshot(versionId).map(insertion)

    return draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (!version) return

        version.edits = edits
        delete version.basedOn
        version.motivations = []
    }
}

type Ids = ReadonlySet<string>

const featureIdsOf = (copy: RollCopy): Ids => new Set(copy.features.map(feature => feature.id))

const insertedIn = (versions: readonly Version[]): AnySymbol[] =>
    versions.flatMap(version => version.edits).flatMap(edit => edit.insert ?? [])

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

/** The items that do not match, or the very same array when none does, so that a draft stays untouched. */
const without = <T,>(items: T[], matches: (item: T) => boolean): T[] =>
    items.some(matches) ? items.filter(item => !matches(item)) : items

const references = [...placementRelations, 'pairedWith'] as const

const forgetPerforations = (perforation: Draft<Note | Expression>, dropped: Ids) =>
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

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

/** Drops the edits the removal has emptied and leaves those that were empty before alone. */
const forgetFeaturesInVersion = (version: Draft<Version>, features: Ids, dropped: Ids) => {
    const emptyBefore = new Set(version.edits.filter(isEmpty).map(edit => edit.id))
    version.edits.forEach(edit => forgetFeaturesInEdit(edit, features, dropped))
    version.edits = without(version.edits, edit => isEmpty(edit) && !emptyBefore.has(edit.id))
}

/**
 * Strikes the features from the versions: their carriers go, a symbol
 * that had no other carrier goes with them, and so does every
 * reference the versions made to such a symbol.
 */
const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const dropped = new Set(insertedIn(draft.versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    draft.versions.forEach(version => forgetFeaturesInVersion(version, features, dropped))
}

/** Takes the features off the copy, and out of the versions with what only they carried. */
export const removeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    draft => {
        const copy = draft.copies.find(c => c.id === copyId)
        if (!copy) return

        const features = new Set(featureIds)
        copy.features = without(copy.features, feature => features.has(feature.id))
        forgetFeatures(draft, features)
    }

/**
 * Takes the copy out of the edition together with the symbols only it
 * carries, and with every reference the versions made to those symbols.
 */
export const removeCopy = (copyId: string): EditionOp =>
    draft => {
        const copy = draft.copies.find(c => c.id === copyId)
        if (!copy) return

        forgetFeatures(draft, featureIdsOf(copy))
        draft.copies = draft.copies.filter(c => c.id !== copyId)
    }

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
    const merged: Edit = {
        ...toMerge[0],
        id: v4(),
        insert: toMerge.flatMap(edit => edit.insert ?? []),
        delete: toMerge.flatMap(edit => edit.delete ?? [])
    }
    merged.editType = guessEditType(view, merged)
    const mergedIds = new Set(toMerge.map(edit => edit.id))

    return draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (!version || toMerge.length === 0) return

        version.edits = [...version.edits.filter(edit => !mergedIds.has(edit.id)), merged]
    }
}

/** Replaces the edit with one edit per inserted and one per deleted symbol. */
export const splitEdit = (versionId: string, toSplit: Edit): EditionOp => {
    const parts = [
        ...(toSplit.insert ?? []).map(insertion),
        ...(toSplit.delete ?? []).map(deletion)
    ]

    return draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (!version) return

        version.edits = [...version.edits.filter(edit => edit.id !== toSplit.id), ...parts]
    }
}
