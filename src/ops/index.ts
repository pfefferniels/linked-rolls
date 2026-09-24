/**
 * The operations on an edition, each written onto an immer draft of it.
 * They are grouped by what they change under `ops/`; this module names
 * the ones the library offers.
 */
export type { EditionOp } from "./draft.js"
export {
    createVersion,
    addCopy,
    alignCopy,
    unalignCopy,
    shortenCopy,
    unshortenCopy,
    stateSource,
    clearSource,
    nameCopy,
    stateCarriage,
    clearCarriage,
    addGeneralCondition,
    symbolsCarriedOnlyBy,
    removeCopy
} from "./copies.js"
export {
    stateFeatureCondition,
    addFeature,
    addBorneFeature,
    removeFeatures,
    mergeObstacle,
    mergeObstacleIn,
    mergeFeatures,
    type FeatureAct,
    type MergeObstacle
} from "./features.js"
export {
    detachVersion,
    removeVersion,
    removeSymbols,
    deriveVersion,
    stateDerivation,
    clearDerivation
} from "./versions.js"
export {
    connectVersions,
    collateSymbols,
    separateReadings
} from "./collation.js"
export {
    mergeEdits,
    splitEdit
} from "./edits.js"
export {
    placeCommand,
    unplaceCommand,
    pairCommands,
    unpairCommand
} from "./commands.js"
export {
    createBelief,
    clearBelief,
    setCertainty,
    addReason,
    removeReason
} from "./beliefs.js"
