import { Concept } from "./Agent"
import { procedures } from "./procedures"
import { systemOf } from "./TrackerBar"
import { trackerBars } from "./systems"

/**
 * The concepts the type vocabulary declares, whatever kind they are:
 * the reproducing systems and the procedures. An edition names one of
 * them by its IRI alone.
 */
export const vocabulary: readonly Concept[] = [
    ...trackerBars.map(systemOf),
    ...procedures
]

/** The concept of that IRI, where the vocabulary declares one. */
export const conceptOf = (id: string | undefined): Concept | undefined =>
    id === undefined ? undefined : vocabulary.find(concept => concept.id === id)

/**
 * What a concept is called: the name it states, else the one the
 * vocabulary gives it, else its IRI, so that a reader always has
 * something to show.
 */
export const nameOf = (concept: Concept): string =>
    concept.name ?? conceptOf(concept.id)?.name ?? concept.id ?? ''
