/**
 * Filiation: proposing a stemma from the copies alone, by the editorial
 * principles the rules of an edition state, and the edits of each of its
 * versions, and taking them into the edition.
 */
export { collateCopies, readingsOfCopy, type CopyCollation, type CollatedReading, type CopyReading, type PairWindow, type Recoding } from "./readings.js"
export { presenceIn, ineffectiveAmong, defaultMargin, type Presence, type PresenceMatrix } from "./presence.js"
export { defaultCosts, type Costs, type Scored, type Support } from "./search.js"
export { transfersOf, systemAbove } from "./systems.js"
export { proposeStemma, defaultMovedWithin, type FiliationOptions, type ProposedVersion, type StemmaProposal, type Unpinned } from "./proposal.js"
export { adoptionOf, adoptStemma, type Adoption } from "./adoption.js"
export { stemmaChanges, type VersionChange } from "./changes.js"
export { sharedTexts, differencesBetween, defaultSameText, type SharedText, type KeptApart } from "./texts.js"
export {
    proposeEdits,
    adoptEdits,
    isRegroupable,
    defaultShiftWithin,
    defaultPairWithin,
    defaultResizeWithin,
    defaultSamePlaceWithin,
    type EditOptions,
    type EditGrouping,
    type ProposedEdit
} from "./edits.js"
