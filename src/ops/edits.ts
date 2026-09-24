/** Merging and splitting the edits of a version. */
import { v4 } from "uuid"
import { EditionView } from "../EditionView.js"
import { AnySymbol, Expression } from "../Symbol.js"
import { Edit, EditType } from "../Edit.js"
import { editsOf } from "../Version.js"
import { TrackerBar } from "../TrackerBar.js"
import { trackerBarOf } from "../systems/index.js"
import { HorizontalSpan } from "../Feature.js"
import { distance, Millimeters, mm, subtract } from "../Quantity.js"
import { EditionOp, noChange, onVersion, insertion, deletion, reading } from "./draft.js"

const sameSequence = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i])

const expressionTypesOf = (symbols: readonly AnySymbol[]) =>
    symbols.filter((symbol): symbol is Expression => symbol.type === 'expression').map(symbol => symbol.expressionType)

/** The spellings of a single added accent the bar offers, none where no bar is known. */
const accentsOn = (bar: TrackerBar | undefined): readonly (readonly string[])[] => bar?.accents ?? []

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
    const deletes = view.symbols(edit.delete ?? [])
    const inserted = expressionTypesOf(inserts)
    const deleted = expressionTypesOf(deletes)

    const bar = trackerBarOf(view.version(versionId)?.system)
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
export const mergeEdits = (given: EditionView, versionId: string, toMerge: readonly Edit[]): EditionOp => reading(given, view => {
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
        version.edits = [...editsOf(version).filter(edit => !mergedIds.has(edit.id)), merged]
    })
})

/** Replaces the edit with one edit per inserted and one per deleted symbol. */
export const splitEdit = (versionId: string, toSplit: Edit): EditionOp => {
    const parts = [
        ...(toSplit.insert ?? []).map(insertion),
        ...(toSplit.delete ?? []).map(deletion)
    ]

    return onVersion(versionId, version => {
        version.edits = [...editsOf(version).filter(edit => edit.id !== toSplit.id), ...parts]
    })
}
