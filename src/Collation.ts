/**
 * Tolerance used in collation of roll copies.
 * The start and end tolerances define the acceptable
 * deviation (in mm) when aligning features across copies.
 */
export interface CollationTolerance {
    /**
     * Tolerance at the start position of a feature (in mm).
     */
    toleranceStart: number

    /**
     * Tolerance at the end position of a feature (in mm).
     */
    toleranceEnd: number
}
