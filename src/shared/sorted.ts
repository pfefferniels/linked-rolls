/**
 * The index at which a list partitioned by the predicate turns: it
 * holds for every item before that index and for none from it on.
 * Binary search, so the list is read in logarithmic time.
 */
export const partitionPoint = <T,>(partitioned: readonly T[], holds: (item: T) => boolean): number => {
    let low = 0
    let high = partitioned.length
    while (low < high) {
        const middle = (low + high) >>> 1
        if (holds(partitioned[middle])) low = middle + 1
        else high = middle
    }
    return low
}
