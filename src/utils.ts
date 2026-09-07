export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithType<T extends string> = {
    /**
     * The type discriminator for this object.
     * @see rdf:type
     */
    readonly type: T
}

export type WithId = {
    /**
     * A unique identifier for this object.
     */
    readonly id: string
}

export type WithNote = {
    /**
     * A free-text note providing additional context.
     * @see crm:P3 has note
     */
    note?: string
}
