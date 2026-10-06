/** Statements that place a command relative to another, or pair two. */
import { Draft } from "immer"
import { getAt, pathIn } from "../lookup/paths.js"
import { AnyCommand, AnySymbol, PlacementRelation, isCommand, placementRelations } from "../model/Symbol.js"
import { assignReference } from "../model/Assumption.js"
import { EditionOp, reading } from "./draft.js"

/**
 * Runs the change on the command with the id, in whichever version
 * inserted it. A statement made there holds in every version that
 * carries the command.
 */
const onCommand = (id: string, op: (command: Draft<AnyCommand>) => void): EditionOp =>
    reading(edition => draft => {
        const path = pathIn(edition, id)
        const symbol = path && getAt<Draft<AnySymbol>>(path, draft)
        if (isCommand(symbol)) op(symbol)
    })

const clearPlacement = (command: Draft<AnyCommand>) =>
    placementRelations.forEach(relation => { delete command[relation] })

/**
 * States how the follower is placed relative to the reference, in place of any earlier statement.
 * @category Operations
 */
export const placeCommand = (
    followerId: string,
    referenceId: string,
    relation: PlacementRelation
): EditionOp =>
    onCommand(followerId, command => {
        clearPlacement(command)
        command[relation] = assignReference(referenceId)
    })

/**
 * Withdraws the statement placing the command relative to another,
 * whichever relation it states.
 * @category Operations
 */
export const unplaceCommand = (followerId: string): EditionOp =>
    onCommand(followerId, clearPlacement)

/**
 * The pair is stated on `statingId` only, as the format asks.
 * @category Operations
 */
export const pairCommands = (statingId: string, partnerId: string): EditionOp =>
    onCommand(statingId, command => {
        command.pairedWith = assignReference(partnerId)
    })

/**
 * Withdraws the pairing the command states.
 * @category Operations
 */
export const unpairCommand = (statingId: string): EditionOp =>
    onCommand(statingId, command => {
        delete command.pairedWith
    })
