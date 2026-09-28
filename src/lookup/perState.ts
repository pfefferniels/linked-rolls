import { freeze, isDraft } from "immer"

/**
 * The edition as a state that no longer changes. It is frozen, deeply
 * and once, as immer freezes what it produces, since what is worked out
 * from a state is kept for as long as the state is: changed in place
 * afterwards, it would leave that behind unnoticed, and frozen, the
 * change throws instead. An edition immer produced is frozen already,
 * and freezing stops at whatever is.
 *
 * A draft is no such state, since the next write changes it. It is read
 * as it stands by taking immer's `current(draft)` first (`stateOf` in the
 * operations), once for all that is asked of it; asked of directly, it
 * would have to be copied for every question.
 */
export const settled = <T extends object>(edition: T): T => {
    if (isDraft(edition)) {
        throw new Error('An edition is asked about as a state, not as a draft: take current(draft) first.')
    }
    return freeze(edition, true)
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
