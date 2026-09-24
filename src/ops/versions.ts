/** Operations on the stemma: deriving, detaching and removing versions, and the derivations they state. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { EditionView } from "../EditionView.js"
import { Derivation, derivesFrom, editsOf, principalDerivationOf, Version } from "../Version.js"
import { Belief, ReferenceAssumption, assignReference, idOf } from "../Assumption.js"
import { EditionOp, onVersion, stateOf, insertion, dropInsertions, referenceHeld, withoutReferences, reading } from "./draft.js"
import { without } from "./immutable.js"
import { dropStatements } from "./copies.js"

/** Whether the version's text is read against the parent, its principal derivation naming it. */
const readsAgainst = (version: Readonly<Version>, parentId: string): boolean => {
    const principal = principalDerivationOf(version)
    return principal !== undefined && idOf(principal) === parentId
}

/** The derivations the version states beside its principal one, less any naming the parent. */
export const hypothesesBeside = (version: Readonly<Version>, parentId: string): Derivation[] => {
    const principal = principalDerivationOf(version)
    return (version.basedOn ?? []).filter(derivation => derivation !== principal && idOf(derivation) !== parentId)
}

/** Takes out the derivations that match, and the list itself where none is left. */
const dropDerivations = (version: Draft<Version>, matches: (derivation: Readonly<Derivation>) => boolean) => {
    const derivations = stateOf<Version>(version).basedOn
    if (!derivations?.some(matches)) return
    const kept = withoutReferences(derivations, matches)
    if (kept) version.basedOn = kept
    else delete version.basedOn
}

/**
 * Makes the version stand on its own: what it inherited becomes its
 * own insertions, and its derivations go, the hypotheses among them,
 * with the motivations that belonged to them.
 */
export const detachVersion = (given: EditionView, versionId: string): EditionOp => reading(given, view => {
    const edits = view.snapshot(versionId).map(insertion)

    return onVersion(versionId, version => {
        version.edits = edits
        delete version.basedOn
        version.motivations = []
    })
})

/**
 * Takes the version out. Whatever read its text against it comes to
 * stand on its own, a hypothesis that something derives from it goes,
 * and so does a copy's statement that it carries the version.
 */
export const removeVersion = (given: EditionView, versionId: string): EditionOp => reading(given, view => {
    const detachments = view.edition.versions
        .filter(version => readsAgainst(version, versionId))
        .map(version => detachVersion(view, version.id))
    const namesIt = (reference: Readonly<ReferenceAssumption>) => idOf(reference) === versionId

    return draft => {
        detachments.forEach(detach => detach(draft))
        draft.versions.forEach(version => dropDerivations(version, namesIt))
        draft.copies.forEach(copy => dropStatements(copy, namesIt))
        draft.versions = without(draft.versions, version => version.id === versionId)
    }
})

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
export const removeSymbols = (versionId: string, symbolIds: readonly string[]): EditionOp =>
    onVersion(versionId, version => dropInsertions(version, new Set(symbolIds)))

/** Moves the edits into a new version based on this one. */
export const deriveVersion = (versionId: string, editIds: readonly string[]): EditionOp =>
    onVersion(versionId, (version, draft) => {
        const chosen = new Set(editIds)
        const moved = editsOf(version).filter(edit => chosen.has(edit.id))
        if (version.edits) version.edits = without(version.edits, edit => chosen.has(edit.id))
        draft.versions.push({
            id: v4(),
            system: stateOf<Version>(version).system,
            basedOn: [assignReference(versionId)],
            edits: moved,
            motivations: []
        })
    })

/**
 * States that the version may also derive from the parent, beside what
 * it derives from already: a hypothesis, such as a contamination, under
 * the belief given. The text stays read against the principal derivation
 * unless the belief holds this one more certain. A version derives from
 * itself, twice from one parent, or from one of its own descendants in
 * no statement.
 */
export const stateDerivation = (versionId: string, parentId: string, belief?: Belief): EditionOp =>
    onVersion(versionId, (version, draft) => {
        const derivations = stateOf<Version>(version).basedOn ?? []
        if (parentId === versionId || derivations.some(derivation => idOf(derivation) === parentId)) return
        if (derivesFrom(stateOf<Version[]>(draft.versions), parentId, versionId)) return
        version.basedOn = [...derivations, referenceHeld(parentId, belief)]
    })

/** Takes back the hypothesis that the version derives from the parent; the principal derivation goes with `detachVersion`. */
export const clearDerivation = (versionId: string, parentId: string): EditionOp =>
    onVersion(versionId, version => {
        if (readsAgainst(stateOf<Version>(version), parentId)) return
        dropDerivations(version, derivation => idOf(derivation) === parentId)
    })
