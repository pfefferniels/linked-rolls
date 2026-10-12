/**
 * What adopting a proposal records of the run that made it: the
 * proposition set the statements it concluded belong to, held under one
 * belief, and the reasoning that belief rests on.
 */
import { v5 } from "uuid"
import { ActorAssignment, Assumption, Certainty, Inference, PropositionSet, TimeSpan } from "../model/Assumption.js"
import { Edition } from "../model/Edition.js"
import { linkedRolls } from "../software.js"

/** The namespace the ids of recorded sets and beliefs are minted in, so that recording the same run again gives them again. */
const RECORDED = 'b7e2a4d1-5c3f-4e86-9a0b-1d2f3e4c5a67'

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
 * What is known of a run of a program beside what it computed: who ran
 * it, when, how firmly what it concluded is held, and by which
 * published rules. An adoption records the run with it; whatever is left
 * out is not stated.
 * @category Filiation
 */
export interface Run {
    /** Who ran the program and so holds what it concluded: the editor. */
    actor?: ActorAssignment

    /** When it ran. */
    date?: TimeSpan

    /** How firmly what it concluded is held: likely, where nothing else is said. */
    certainty?: Certainty

    /** The rules it followed, by IRI, in place of those the library names (`stemmaRules`, `editRules`). */
    applies?: string[]
}

/** What a recorded run concluded besides its statements: what the inference says of itself. */
export interface Concluded {
    /** What the run is, and what it was computed with, in words. */
    note: string
    premises: string[]
    used: string[]
    applies: string[]
}

/**
 * The proposition set of a run, with its belief and the inference it
 * rests on. Its id follows from what it is given, so that recording the
 * same run again gives the same set.
 */
export const recorded = (kind: string, identity: unknown, concluded: Concluded, run: Run): PropositionSet => {
    const id = `propositions_${v5(JSON.stringify([kind, linkedRolls, identity]), RECORDED)}`
    const inference: Inference = {
        type: 'inference',
        ...(run.actor && { actor: run.actor }),
        note: concluded.note,
        premises: concluded.premises,
        ...(concluded.used.length > 0 && { used: concluded.used }),
        applies: run.applies ?? concluded.applies,
        software: [linkedRolls],
        ...(run.date && { date: run.date })
    }
    return {
        type: 'propositionSet',
        id,
        belief: {
            type: 'belief',
            id: `belief_${v5(id, RECORDED)}`,
            certainty: run.certainty ?? 'likely',
            reasons: [inference]
        }
    }
}

/** The statement as one of the set: its annotation names the set, and it carries no belief of its own. */
export const memberOf = <T extends Assumption>(set: string, statement: T): T =>
    statement['@annotation']?.id === set && statement['@annotation'].belief === undefined
        ? statement
        : { ...statement, '@annotation': { id: set } }

/** The ids every annotation of the value names a set by, and every premise names a belief by. */
const namedIn = (value: unknown, names: Set<string>): void => {
    if (Array.isArray(value)) {
        value.forEach(item => namedIn(item, names))
        return
    }
    if (value === null || typeof value !== 'object' || value instanceof Date) return
    const record = value as Record<string, unknown>
    const annotation = record['@annotation'] as { id?: string, belief?: unknown } | undefined
    if (annotation?.id !== undefined && annotation.belief === undefined) names.add(annotation.id)
    if (Array.isArray(record.premises)) record.premises.forEach(premise => typeof premise === 'string' && names.add(premise))
    Object.values(record).forEach(child => namedIn(child, names))
}

/**
 * The sets the edition keeps, with those given added where it holds none
 * with their id: a set already recorded stays as it was recorded, by
 * whom and when it was first concluded. Kept are the sets a statement
 * belongs to, and those whose belief the reasons of another kept
 * statement or set name as a premise. A set nothing names any longer is
 * the record of a run whose conclusions have all been replaced.
 */
export const keptSets = (edition: Edition, adding: readonly PropositionSet[]): PropositionSet[] | undefined => {
    const held = edition.propositionSets ?? []
    const known = new Set(held.map(set => set.id))
    const sets = [...held, ...adding.filter(set => !known.has(set.id))]
    const named = new Set<string>()
    namedIn({ ...edition, propositionSets: [] }, named)
    const kept = new Set<PropositionSet>()
    for (let grown = true; grown;) {
        grown = false
        for (const set of sets) {
            if (kept.has(set) || !(named.has(set.id) || named.has(set.belief.id))) continue
            kept.add(set)
            namedIn(set.belief, named)
            grown = true
        }
    }
    const keeping = sets.filter(set => kept.has(set))
    return keeping.length > 0 ? keeping : undefined
}

/** A distance in millimetres as a note gives it. */
export const inMillimetres = (value: number): string => `${Math.round(value * 100) / 100} mm`
