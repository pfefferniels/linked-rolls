/** Striking features from the edition, and rewriting the ids by which the edition names them outside the versions. */
import { Draft } from "immer"
import { Edition } from "../model/Edition.js"
import { AnyCommand, AnySymbol, isCommand, placementRelations } from "../model/Symbol.js"
import { Edit } from "../model/Edit.js"
import { editsOf, Version } from "../model/Version.js"
import { featuresOf, Modification, RollCopy, statesNothing } from "../model/RollCopy.js"
import { AnyArgumentation, Belief, MeaningComprehension, idOf } from "../model/Assumption.js"
import { withBorneFeatures } from "../model/Feature.js"
import { stateOf, droppedIds, Ids, insertedIn, edited } from "./draft.js"
import { without, mapped, pruned, replacing, Node, deeply, writeInto } from "./immutable.js"

/** The ids of every feature the copy bears, those a patch bears among them. */
export const featureIdsOf = (copy: RollCopy): Ids =>
    new Set(featuresOf(copy).flatMap(withBorneFeatures).map(feature => feature.id))

/**
 * A symbol every carrier of which lies among the features loses its
 * evidence with them. A symbol without carriers, such as a label,
 * stands on its own.
 */
export const carriedOnlyOn = (features: Ids) => (symbol: AnySymbol): boolean =>
    symbol.carriers.length > 0 && symbol.carriers.every(carrier => features.has(idOf(carrier)))

const references = [...placementRelations, 'pairedWith'] as const

/** The command without its references to the dropped symbols, or the very same one where it makes none. */
const forgettingReferences = (command: AnyCommand, dropped: Ids): AnyCommand => {
    const stale = references.filter(relation => {
        const reference = command[relation]
        return reference !== undefined && dropped.has(idOf(reference))
    })
    if (stale.length === 0) return command

    const kept = { ...command }
    stale.forEach(relation => { delete kept[relation] })
    return kept
}

/** The symbol without the features among its carriers, and without references to what went with them. */
const forgettingCarriers = (features: Ids, dropped: Ids) => (symbol: AnySymbol): AnySymbol => {
    const carriers = without(symbol.carriers, carrier => features.has(idOf(carrier)))
    const relieved: AnySymbol = carriers === symbol.carriers ? symbol : { ...symbol, carriers }
    return isCommand(relieved) ? forgettingReferences(relieved, dropped) : relieved
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

/** The ids a statement names, as the rewriting leaves them. */
type Rename = (ids: string[]) => string[]

const isCopy = (record: object): record is RollCopy =>
    'type' in record && record.type === 'RollCopy'

const isBelief = (record: object): record is Belief =>
    'type' in record && record.type === 'belief'

const isComprehension = (reason: AnyArgumentation): reason is MeaningComprehension =>
    reason.type === 'meaningComprehension'

const comprehendsNothing = (reason: AnyArgumentation): boolean =>
    isComprehension(reason) && reason.comprehends.length === 0

/**
 * The modification with what it names rewritten, or the very same one
 * where that leaves it as it was. Only a removal names anything by id:
 * what an act produced or glued on it states itself.
 */
const renamingMembers = (rename: Rename) => (modification: Modification): Modification =>
    modification.type === 'Removal'
        ? replacing(modification, 'removed', rename(modification.removed))
        : modification

/** The reason with what a comprehension comprehends rewritten; any other reason names nothing of the kind. */
const renamingComprehended = (rename: Rename) => (reason: AnyArgumentation): AnyArgumentation =>
    isComprehension(reason) ? replacing(reason, 'comprehends', rename(reason.comprehends)) : reason

/**
 * The record with the ids it names rewritten: what a copy's removals
 * removed, and what the comprehensions among a belief's reasons
 * comprehend. A removal or a comprehension the rewriting emptied goes
 * with what it named; one that named nothing before stays, as an edit
 * that was empty before it does.
 */
const renaming = (rename: Rename) => (record: object): object => {
    if (isCopy(record)) {
        return replacing(record, 'modifications',
            pruned(record.modifications, renamingMembers(rename), statesNothing))
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
export const renameReferences = (draft: Draft<Edition>, rename: Rename) => {
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
export const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const versions = stateOf<Version[]>(draft.versions)
    const dropped = new Set(insertedIn(versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    const forget = forgettingFeatures(features, dropped)
    const edits = versions.map(version => version.edits && edited(version.edits, forget))
    const gone = new Set([
        ...features,
        ...dropped,
        ...versions.flatMap((version, i) => droppedIds(editsOf(version), edits[i] ?? []))
    ])

    renameReferences(draft, ids => without(ids, id => gone.has(id)))
    draft.versions.forEach((version, i) => {
        const stated = edits[i]
        if (stated) version.edits = stated
    })
}
