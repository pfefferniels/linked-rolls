import { Quantity, quantity } from "./Quantity.js"

/**
 * The statistics a sample of measurements is described with.
 *
 * The centre and the scatter are taken from the median rather than from
 * the mean, because the departures a measurement over an edition looks
 * for are in the sample it is taken over. A mean and a standard
 * deviation would grow towards those departures until they no longer
 * stood out; a median and a median absolute deviation leave them out of
 * account.
 */

/** The middle of a sample, the mean of the two middle values where it has an even number of them. */
export const medianOf = <U extends string>(values: readonly Quantity<U>[]): Quantity<U> | undefined => {
    if (values.length === 0) return undefined

    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
        ? sorted[middle]
        : quantity<U>((sorted[middle - 1] + sorted[middle]) / 2)
}

/** What the median absolute deviation must be multiplied by to estimate the standard deviation of a normal sample. */
const MAD_TO_SIGMA = 1.4826

/** Where a sample sits and how far it scatters. */
export interface Spread<U extends string> {
    /** How many measurements it was taken over. */
    n: number

    /** The middle measurement. */
    median: Quantity<U>

    /**
     * The scatter about the median, as the median absolute deviation
     * scaled to the standard deviation a normal sample of that scatter
     * would have. It is zero where more than half the sample sits at
     * one value, and no scatter can be read off such a sample.
     */
    sigma: Quantity<U>
}

/** Where the sample sits and how far it scatters, or nothing for an empty sample. */
export const spreadOf = <U extends string>(values: readonly Quantity<U>[]): Spread<U> | undefined => {
    const median = medianOf(values)
    if (median === undefined) return undefined

    const deviations = values.map(value => quantity<U>(Math.abs(value - median)))
    return {
        n: values.length,
        median,
        sigma: quantity<U>(MAD_TO_SIGMA * (medianOf(deviations) ?? 0))
    }
}

/** How far the value lies from the centre of the spread, in units of its scatter. */
export const standardise = <U extends string>(value: Quantity<U>, spread: Spread<U>): number =>
    (value - spread.median) / spread.sigma

/** The complementary error function, after Press et al., whose fractional error stays below 1.2e-7. */
const erfc = (x: number): number => {
    const z = Math.abs(x)
    const t = 1 / (1 + z / 2)
    const tail = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
            t * (-0.82215223 + t * 0.17087277)))))))))
    return x >= 0 ? tail : 2 - tail
}

/** The share of a normal sample lying below `z` standard deviations. */
export const normalBelow = (z: number): number => erfc(-z / Math.SQRT2) / 2

/** The share of a normal sample lying further than `z` standard deviations from its centre, on either side. */
export const normalBeyond = (z: number): number => erfc(z / Math.SQRT2)

const horner = (coefficients: readonly number[], x: number): number =>
    coefficients.reduce((total, coefficient) => total * x + coefficient, 0)

const CENTRAL_NUMERATOR = [
    -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00
]
const CENTRAL_DENOMINATOR = [
    -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01
]
const TAIL_NUMERATOR = [
    -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00
]
const TAIL_DENOMINATOR = [
    7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00
]

/** Outside this share the tail approximation is used in place of the central one. */
const CENTRAL_SHARE = 0.02425

const tailQuantile = (share: number): number => {
    const q = Math.sqrt(-2 * Math.log(share))
    return horner(TAIL_NUMERATOR, q) / (horner(TAIL_DENOMINATOR, q) * q + 1)
}

/**
 * How many standard deviations out the given share of a normal sample
 * lies below, after Acklam's rational approximation, whose relative
 * error stays below 1.15e-9. The inverse of `normalBelow`.
 */
export const normalQuantile = (share: number): number => {
    if (share <= 0) return -Infinity
    if (share >= 1) return Infinity
    if (share < CENTRAL_SHARE) return tailQuantile(share)
    if (share > 1 - CENTRAL_SHARE) return -tailQuantile(1 - share)

    const q = share - 0.5
    const r = q * q
    return horner(CENTRAL_NUMERATOR, r) * q / (horner(CENTRAL_DENOMINATOR, r) * r + 1)
}

/**
 * How much heavier the tails of a standardised sample are than a normal
 * sample's. Zero for a normal shape, positive where more of the sample
 * lies far out than the curve allows.
 */
export const excessKurtosisOf = (standardised: readonly number[]): number =>
    standardised.reduce((total, z) => total + z ** 4, 0) / standardised.length - 3

/** How much of a sample lies beyond a given distance from its centre, against how much would under a normal curve. */
export interface Tail {
    /** The distance from the centre, in standard deviations. */
    beyond: number

    /** How many of the sample lie further out than that. */
    observed: number

    /** How many a normal sample of the same size would put there. */
    expected: number
}

/** What the sample puts beyond the given distance, against what a normal sample would. */
export const tailOf = (standardised: readonly number[], beyond: number): Tail => ({
    beyond,
    observed: standardised.filter(z => Math.abs(z) > beyond).length,
    expected: standardised.length * normalBeyond(beyond)
})

/** A sample counted into bins of one width. */
export interface Histogram<U extends string> {
    /** The bounds of the bins, in order, one more of them than there are counts. */
    edges: Quantity<U>[]

    /** How many of the sample fall in each bin. */
    counts: number[]
}

/**
 * The sample counted into bins of the given width, laid out on
 * multiples of that width so that two histograms of one width share
 * their bounds. Nothing for an empty sample or a width of nothing.
 */
export const histogramOf = <U extends string>(
    values: readonly Quantity<U>[],
    binWidth: Quantity<U>
): Histogram<U> | undefined => {
    if (values.length === 0 || binWidth <= 0) return undefined

    const first = Math.floor(Math.min(...values) / binWidth) * binWidth
    const last = Math.ceil(Math.max(...values) / binWidth) * binWidth
    const bins = Math.max(1, Math.round((last - first) / binWidth))

    return {
        edges: Array.from({ length: bins + 1 }, (_, i) => quantity<U>(first + i * binWidth)),
        counts: values.reduce((tally, value) => {
            tally[Math.min(bins - 1, Math.floor((value - first) / binWidth))] += 1
            return tally
        }, Array.from({ length: bins }, () => 0))
    }
}
