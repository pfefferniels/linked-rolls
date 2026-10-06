export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * An object that says by its type which kind of entity it is.
 * @category Model
 */
export type WithType<T extends string> = {
    /**
     * The type discriminator for this object.
     * @see rdf:type
     */
    readonly type: T
}

/**
 * An object the edition identifies, so that others can refer to it.
 * @category Model
 */
export type WithId = {
    /**
     * A unique identifier for this object.
     */
    readonly id: string
}

/** Whether a value is a date as the format writes one, `YYYY-MM-DD`. */
export const isDateString = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(value)

/** The items by the key each of them gives, every group in the order its first item came in. */
export const groupBy = <T,>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> =>
    items.reduce((groups, item) => {
        const key = keyOf(item)
        const group = groups.get(key)
        if (group) group.push(item)
        else groups.set(key, [item])
        return groups
    }, new Map<string, T[]>())

/**
 * An object that may carry a note in free text.
 * @category Model
 */
export type WithNote = {
    /**
     * A free-text note providing additional context.
     * @see crm:P3 has note
     */
    note?: string
}
