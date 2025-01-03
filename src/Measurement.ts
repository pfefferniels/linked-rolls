import { WithId } from "./WithId"

/**
 * Based on D11 Digital Measurement Event and D10 Software Execution
 */
export interface RollMeasurement extends WithId {
    dimensions?: {
        width: number, 
        height: number, 
        unit: string
    }

    punchDiameter?: {
        value: number 
        unit: string
    }

    holeSeparation?: {
        value: number 
        unit: string
    }

    margins?: {
        treble: number 
        bass: number 
        unit: string
    }

    software: string  // used software or firmware
    date: string // L31 has starting date
}
