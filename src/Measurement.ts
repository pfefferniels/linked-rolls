import { WithId } from "./WithId"

/**
 * Based on D11 Digital Measurement Event and D10 Software Execution
 */
export interface RollMeasurement extends WithId {
    actor?: string // was carried out by. This should point to a person
    software: string  // used software or firmware
    date: string // L31 has starting date
}
