import { current, Draft, freeze, isDraft, original } from "immer"

/**
 * Copies taken of a draft as it stood, for an operation to read. Such a
 * copy is the operation's alone and is not frozen: what the operation
 * reads from it may go into the draft, and a later operation on the same
 * draft may go on to change it there, as it may anything written there.
 */
const takenOfDrafts = new WeakSet<object>()

/**
 * The draft as it stands, as plain data: the state it was drafted from
 * while nothing has changed it, and a copy of it as it now stands once
 * something has.
 */
export const takenOf = <T extends object>(draft: Draft<T>): T => {
    const state = current(draft) as T
    if (state !== original(draft)) takenOfDrafts.add(state)
    return state
}

/**
 * The edition as a state that no longer changes. It is frozen, deeply
 * and once, as immer freezes what it produces, since what is worked out
 * from a state is kept for as long as the state is: changed in place
 * afterwards, it would leave that behind unnoticed, and frozen, the
 * change throws instead. An edition immer produced is frozen already,
 * and freezing stops at whatever is. A copy taken of a draft is left as
 * it is (`takenOf`).
 *
 * A draft is no such state, since the next write changes it. It is read
 * as it stands by taking `stateOf(draft)` first, once for all that is
 * asked of it; asked of directly, it would have to be copied for every
 * question.
 */
export const settled = <T extends object>(edition: T): T => {
    if (isDraft(edition)) {
        throw new Error('An edition is asked about as a state, not as a draft: take stateOf(draft) first.')
    }
    return takenOfDrafts.has(edition) ? edition : freeze(edition, true)
}

/**
 * What is worked out from an edition, once for each state of it.
 *
 * Every change to an edition yields a new object, immer's produce
 * included, so the state an object stands for never changes and what
 * was worked out from it holds for as long as the object is around.
 * Nothing is worked out before it is first asked for, and nothing is
 * kept once the state is gone.
 */
export const perState = <E extends object, T>(work: (edition: E) => T): ((edition: E) => T) => {
    const known = new WeakMap<E, { readonly value: T }>()
    return edition => {
        // A state known already was settled when it became known, and a
        // draft never is, so only what is asked of for the first time
        // needs settling.
        const kept = known.get(edition)
        if (kept) return kept.value

        const state = settled(edition)
        const entry = { value: work(state) }
        known.set(state, entry)
        return entry.value
    }
}
