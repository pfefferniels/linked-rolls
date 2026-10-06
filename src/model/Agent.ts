import { WithId } from "../shared/utils.js";

/**
 * Something with a name and, where one exists, an authority record.
 * @category Format types
 */
export interface Named {
    /**
     * The name, e.g. "Grünfeld, Alfred", "Wien", "M. Welte & Söhne".
     * @see rdfs:label
     */
    name: string

    /**
     * Authority records for the same thing: GND, Wikidata,
     * geonames or similar.
     * @see owl:sameAs
     * @example "https://d-nb.info/gnd/116888652"
     */
    sameAs: string[]
}

/**
 * The parts an editor may take in the editorial work.
 * @category Vocabulary
 */
export const editorialRoles = [
    'editor',
    'transcription',
    'collation',
    'encoding',
    'commentary',
    'proofreading'
] as const

/**
 * The part an editor took in the editorial work.
 * @category Format types
 */
export type EditorialRole = typeof editorialRoles[number]

/**
 * The roles an agent may play in the context of the edition besides the
 * editorial ones.
 * @category Vocabulary
 */
export const nonEditorialRoles = ['pianist', 'publisher'] as const

/**
 * The role an agent plays in the context of the edition.
 * @category Format types
 */
export type AgentRole = EditorialRole | typeof nonEditorialRoles[number]

/**
 * Every role an agent may play in the context of the edition, those
 * that are not editorial first.
 * @category Vocabulary
 */
export const agentRoles: readonly AgentRole[] = [...nonEditorialRoles, ...editorialRoles]

/**
 * A person or a group: a pianist, an editor, a publisher,
 * a manufacturer, a library.
 * @see crm:E39 Actor
 * @category Format types
 */
export interface Agent extends Named, Partial<WithId> {
    /**
     * The role of the agent in the context of the edition.
     * @see crm:P2 has type
     */
    role?: AgentRole
}

/**
 * An agent that is a person.
 * @category Format types
 */
export type Person = Agent

/**
 * A person who took part in preparing the edition.
 * @category Format types
 */
export interface Editor extends Person {
    /**
     * The part this person took in the editorial work.
     * @see crm:P2 has type
     */
    role: EditorialRole
}

/**
 * An activity that may name the person who carried it out.
 * @category Format types
 */
export type WithActor = {
    /**
     * The person who carried out this activity.
     * @see crm:P14 carried out by
     */
    actor?: Person
}

/**
 * A place, e.g. a recording location, publishing location, etc.
 * @see crm:E53 Place
 * @category Format types
 */
export interface Place extends Named { }

/**
 * A term from a vocabulary, such as a roll system, a procedure or a
 * kind of paper.
 *
 * A term the type vocabulary declares is named by its IRI, and what it
 * is called stands in the vocabulary rather than in the edition, so it
 * needs no name of its own; `nameOf` reads one either way. A term the
 * vocabulary does not have is given by name, which is then all there is
 * to go on.
 * @see crm:E55 Type
 * @category Format types
 */
export type Concept =
    | (WithId & Partial<Named>)
    | (Named & Partial<WithId>)

/**
 * Software that captured a copy or measured it: the transcriber that
 * read a recording into notes, the emulator that wrote a MIDI file, the
 * program that found the holes on a scan or aligned two copies.
 * @see crmdig:D14 Software
 * @category Format types
 */
export interface Software {
    /**
     * @see rdfs:label
     */
    name: string

    /**
     * The release, the commit, or the model checkpoint of a transcriber.
     * @see owl:versionInfo
     */
    version?: string
}
