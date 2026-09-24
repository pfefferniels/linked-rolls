/** Statements that place a command relative to another, or pair two. */
import { Draft } from "immer"
import { EditionView, getAt } from "../EditionView.js"
import { AnyCommand, AnySymbol, PlacementRelation, isCommand, placementRelations } from "../Symbol.js"
import { assignReference } from "../Assumption.js"
import { EditionOp } from "./draft.js"

/**
 * Runs the change on the command the view locates by id, in whichever
 * version inserted it. A statement made there holds in every version
 * that carries the command.
 */
const onCommand = (view: EditionView, id: string, op: (command: Draft<AnyCommand>) => void): EditionOp =>
    draft => {
        const path = view.getPath(id)
        const symbol = path && getAt<Draft<AnySymbol>>(path, draft)
        if (isCommand(symbol)) op(symbol)
    }

const clearPlacement = (command: Draft<AnyCommand>) =>
    placementRelations.forEach(relation => { delete command[relation] })

/** States how the follower is placed relative to the reference, in place of any earlier statement. */
export const placeCommand = (
    view: EditionView,
    followerId: string,
    referenceId: string,
    relation: PlacementRelation
): EditionOp =>
    onCommand(view, followerId, command => {
        clearPlacement(command)
        command[relation] = assignReference(referenceId)
    })

export const unplaceCommand = (view: EditionView, followerId: string): EditionOp =>
    onCommand(view, followerId, clearPlacement)

/** The pair is stated on `statingId` only, as the format asks. */
export const pairCommands = (view: EditionView, statingId: string, partnerId: string): EditionOp =>
    onCommand(view, statingId, command => {
        command.pairedWith = assignReference(partnerId)
    })

export const unpairCommand = (view: EditionView, statingId: string): EditionOp =>
    onCommand(view, statingId, command => {
        delete command.pairedWith
    })
