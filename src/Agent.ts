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

export const agentRoles = ['pianist', 'editor', 'publisher'] as const

/**
 * The role an agent plays in the context of the edition.
 */
export type AgentRole = typeof agentRoles[number]

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
