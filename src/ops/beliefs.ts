/** The beliefs annotating the statements of the edition. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { getAt, Path } from "../EditionView.js"
import { AnyArgumentation, Assumption, Belief, Certainty } from "../Assumption.js"
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
