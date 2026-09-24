/** What the operations are built from: the type of an operation, how one finds what it writes to on the draft, and the edits it writes. */
import { current, Draft, isDraft } from "immer"
import { v4 } from "uuid"
import { Edition } from "../Edition.js"
import { AnySymbol } from "../Symbol.js"
import { unchecked, uncheckedMotivation } from "../Collation.js"
import { Edit } from "../Edit.js"
import { insertedBy, Motivation, Version } from "../Version.js"
import { featuresOf, RollCopy } from "../RollCopy.js"
import { Belief, ReferenceAssumption, assignReference } from "../Assumption.js"
import { FeatureOrPatch } from "../Feature.js"
import { WithId } from "../utils.js"
import { without, pruned } from "./immutable.js"

/**
 * A change to an edition, written onto an immer draft of it. One
 * operation is one undo step, so an operation that has to read the
 * edition first takes an `EditionView` of the state it will be
 * applied to and does all its writing in the one function it returns.
 */
export type EditionOp = (draft: Draft<Edition>) => void

export const noChange: EditionOp = () => undefined

export const onCopy = (copyId: string, op: (copy: Draft<RollCopy>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const copy = draft.copies.find(c => c.id === copyId)
        if (copy) op(copy, draft)
    }

export const onVersion = (versionId: string, op: (version: Draft<Version>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (version) op(version, draft)
    }

export const onFeature = (copyId: string, featureId: string, op: (feature: Draft<FeatureOrPatch>) => void): EditionOp =>
    onCopy(copyId, copy => {
        const feature = featuresOf(copy).find(f => f.id === featureId)
        if (feature) op(feature)
    })

/**
 * The state a draft stands at, as plain data. Reading a draft proxies
 * everything it touches, so what is only read is read from this.
 */
export const stateOf = <T,>(draft: Draft<T>): T => isDraft(draft) ? current(draft) : draft as T

/** The ids of the items the rewriting left out. */
export const droppedIds = (before: readonly WithId[], after: readonly WithId[]): string[] => {
    const kept = new Set(after.map(item => item.id))
    return before.flatMap(item => kept.has(item.id) ? [] : [item.id])
}

export type Ids = ReadonlySet<string>

export const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

export const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

/** The edit as a collation leaves it: made by rule, and not yet read by anybody. */
export const asUnchecked = (edit: Edit): Edit => ({ ...edit, motivation: unchecked })

/**
 * The motivations with the unchecked one declared, where any edit
 * names it and the version does not state it yet. An edit naming a
 * motivation the version leaves undeclared points at nothing.
 */
export const declaring = (motivations: Motivation[], edits: readonly Edit[]): Motivation[] =>
    edits.some(edit => edit.motivation === unchecked)
        && !motivations.some(motivation => motivation.id === unchecked)
        ? [...motivations, uncheckedMotivation]
        : motivations

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

export const insertedIn = (versions: readonly Version[]): AnySymbol[] => versions.flatMap(insertedBy)

/** The edits with the change applied, less those it emptied; the very same array where it changed none. */
export const edited = (edits: Edit[], change: (edit: Edit) => Edit): Edit[] => pruned(edits, change, isEmpty)

/** The edit without the symbols among its insertions, or the very same edit where it inserts none of them. */
const droppingInsertions = (symbolIds: Ids) => (edit: Edit): Edit => {
    const insert = edit.insert && without(edit.insert, symbol => symbolIds.has(symbol.id))
    return insert === edit.insert ? edit : { ...edit, insert }
}

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
export const dropInsertions = (version: Draft<Version>, symbolIds: Ids) => {
    const edits = stateOf<Version>(version).edits
    if (edits) version.edits = edited(edits, droppingInsertions(symbolIds))
}

/** A reference under the belief given, where one is given. */
export const referenceHeld = (id: string, belief?: Belief): ReferenceAssumption =>
    ({ ...assignReference(id), ...(belief && { '@annotation': { id: v4(), belief } }) })

/** The references less those that match, or nothing where none is left. */
export const withoutReferences = <R extends ReferenceAssumption>(references: readonly R[], matches: (reference: Readonly<R>) => boolean): R[] | undefined => {
    const kept = references.filter(reference => !matches(reference))
    return kept.length > 0 ? kept : undefined
}
