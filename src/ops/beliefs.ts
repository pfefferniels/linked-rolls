/** The beliefs annotating the statements of the edition. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { getAt, Path } from "../lookup/paths.js"
import { AnyArgumentation, Assumption, Belief, Certainty } from "../model/Assumption.js"
import { EditionOp } from "./draft.js"

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

/**
 * Annotates the assumption at the path with a belief held true, for reasons to be added.
 * @category Operations
 */
export const createBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        assumption['@annotation'] = {
            id: v4(),
            belief: { type: 'belief', id: v4(), certainty: 'true', reasons: [] }
        }
    })

/**
 * Takes the belief off the assumption at the path, which leaves the
 * statement stated plainly.
 * @category Operations
 */
export const clearBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        delete assumption['@annotation']
    })

/**
 * Sets the certainty the belief on the assumption at the path is held
 * with.
 * @category Operations
 */
export const setCertainty = (path: Path, certainty: Certainty): EditionOp =>
    onBeliefAt(path, belief => {
        belief.certainty = certainty
    })

/**
 * Adds a reason to the belief on the assumption at the path.
 * @category Operations
 */
export const addReason = (path: Path, reason: AnyArgumentation): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.push(reason)
    })

/**
 * Takes the reason at the index off the belief on the assumption at the
 * path.
 * @category Operations
 */
export const removeReason = (path: Path, index: number): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.splice(index, 1)
    })
