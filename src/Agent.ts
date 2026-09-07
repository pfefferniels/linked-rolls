import { WithId } from "./utils";

/**
 * Something with a name and, where one exists, an authority record.
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
 */
export type EditorialRole = typeof editorialRoles[number]

const nonEditorialRoles = ['pianist', 'publisher'] as const

/**
 * The role an agent plays in the context of the edition.
 */
export type AgentRole = EditorialRole | typeof nonEditorialRoles[number]

export const agentRoles: readonly AgentRole[] = [...nonEditorialRoles, ...editorialRoles]

/**
 * A person or a group: a pianist, an editor, a publisher,
 * a manufacturer, a library.
 * @see crm:E39 Actor
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
 */
export type Person = Agent

/**
 * A person who took part in preparing the edition.
 */
export interface Editor extends Person {
    /**
     * The part this person took in the editorial work.
     * @see crm:P2 has type
     */
    role: EditorialRole
}

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
 */
export interface Place extends Named { }

/**
 * A term from a vocabulary, such as a roll system or a kind of
 * paper. A term the type vocabulary knows carries its IRI as `id`.
 * @see crm:E55 Type
 */
export interface Concept extends Named, Partial<WithId> { }
