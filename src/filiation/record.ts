/**
 * What adopting a proposal records of how it was found: the published
 * rules the proposal follows, among the principles of the edition, and
 * the release of this library, among the software it was made with.
 */
import { EditionCreation } from "../model/Edition.js"
import { linkedRolls } from "../software.js"

/**
 * The published rules the proposal of a stemma follows, by IRI, each
 * under the cost or the step that carries it out. They are the
 * editorial principles of the edition of WM 225, which are suggested
 * for the filiation of piano rolls at large.
 * @category Filiation
 */
export const stemmaRules = {
    /** An addition at the same place is not made twice independently, so a reading arising costs ten times one lost. */
    sharedAddition: 'https://welte225.org/rules#shared-addition',
    /** Redundancies are cleaned up in two branches independently, so losing one counts for less. */
    independentCleanup: 'https://welte225.org/rules#independent-cleanup',
    /** A re-cut for another system was an editorial pass of its own, so what it lacks counts for less. */
    recutLoss: 'https://welte225.org/rules#recut-loss',
    /** A copy may fail to show a reading of the version it carries. */
    copyDeviation: 'https://welte225.org/rules#copy-deviation',
    /** A lost state is posited only where shared additions require it. */
    lostStates: 'https://welte225.org/rules#lost-states',
    /** Copies of one system that differ in a few readings carry one text. */
    oneText: 'https://welte225.org/rules#one-text',
    /** Later versions are the more refined, which orients the root. */
    refinement: 'https://welte225.org/rules#refinement',
    /** A version derives from one exemplar, so a stemma is a tree. */
    noContamination: 'https://welte225.org/rules#no-contamination'
} as const

/**
 * The published rules the proposal of edits follows, by IRI.
 * @category Filiation
 */
export const editRules = {
    /** An edit stays at one place: it runs across no command both texts keep. */
    onePlace: 'https://welte225.org/rules#one-place'
} as const

/**
 * The edition's creation as adopting a proposal leaves it. Its
 * principles come to name the rules the proposal follows, in place of
 * those given to be replaced, which are the rules of the same kind that
 * it no longer follows; the principles the editor named stay. Its
 * software comes to name this release of the library, in place of any
 * other release of it, so that the release named finds again what the
 * edition states.
 */
export const madeWith = (
    creation: Readonly<EditionCreation>,
    rules: readonly string[],
    replacing: readonly string[] = []
): EditionCreation => {
    const replaced = new Set(replacing)
    const principles = [...new Set([...(creation.principles ?? []).filter(rule => !replaced.has(rule)), ...rules])]
    const software = [...(creation.software ?? []).filter(program => program.name !== linkedRolls.name), linkedRolls]
    return { ...creation, principles, software }
}
