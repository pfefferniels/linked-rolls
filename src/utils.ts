import { Person } from "./Edition"

export type WithType<T extends string> = {
    type: T
}

export type WithId = {
    id: string
}

export type WithActor = {
    actor?: Person // P14 carried out by
}

export type WithNote = {
    note?: string // P3 has note
}
