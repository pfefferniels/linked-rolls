import { Person } from "./Edition"

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithType<T extends string> = {
    readonly type: T
}

export type WithId = {
    readonly id: string
}

export type WithActor = {
    actor?: Person // P14 carried out by
}

export type WithNote = {
    note?: string // P3 has note
}
