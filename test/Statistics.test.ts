import { describe, expect, it } from 'vitest'
import {
    excessKurtosisOf, histogramOf, medianOf, normalBelow, normalBeyond, normalQuantile, spreadOf, standardise, tailOf
} from '../src/collation/statistics'
import { Millimeters, mm } from '../src/model/Quantity'

/**
 * A normal sample without a generator: the quantiles at equally spaced
 * shares. It has the centre and the scatter it was asked for to as many
 * places as matter here, and it is the same sample every run.
 */
const normalSample = (n: number, centre: number, sigma: number): Millimeters[] =>
    Array.from({ length: n }, (_, i) => mm(centre + sigma * normalQuantile((i + 0.5) / n)))

describe('the middle of a sample', () => {
    it('is the middle value where the sample has an odd number of them', () => {
        expect(medianOf([mm(3), mm(1), mm(2)])).toBe(2)
    })

    it('is the mean of the two middle ones where it has an even number', () => {
        expect(medianOf([mm(4), mm(1), mm(2), mm(3)])).toBe(2.5)
    })

    it('is nothing for a sample with no values', () => {
        expect(medianOf([])).toBeUndefined()
    })
})

describe('the scatter of a sample', () => {
    it('recovers the centre and the scatter of a normal sample', () => {
        const spread = spreadOf(normalSample(1000, 0.4, 0.9))!

        expect(spread.n).toBe(1000)
        expect(spread.median).toBeCloseTo(0.4, 3)
        expect(spread.sigma).toBeCloseTo(0.9, 3)
    })

    /**
     * The point of the median absolute deviation. A standard deviation
     * over the same sample comes out near 1.6, wide enough to take the
     * planted displacements for ordinary scatter.
     */
    it('is barely moved by a minority lying far out', () => {
        const planted = Array.from({ length: 10 }, () => mm(8))
        const spread = spreadOf([...normalSample(990, 0.4, 0.9), ...planted])!

        expect(spread.sigma).toBeCloseTo(0.91, 2)
        expect(standardise(mm(8), spread)).toBeGreaterThan(8)
    })

    it('is nothing where more than half the sample sits at one value', () => {
        expect(spreadOf(Array.from({ length: 10 }, () => mm(2)))!.sigma).toBe(0)
    })
})

describe('the normal curve', () => {
    it('puts the shares beyond two, three and four deviations where the tables do', () => {
        expect(normalBeyond(2)).toBeCloseTo(0.0455003, 7)
        expect(normalBeyond(3)).toBeCloseTo(0.0026998, 7)
        expect(normalBeyond(4)).toBeCloseTo(0.0000633, 7)
    })

    it('inverts what it integrates, to the accuracy the approximations claim', () => {
        [0.001, 0.25, 0.5, 0.975, 0.9999].forEach(share =>
            expect(normalBelow(normalQuantile(share))).toBeCloseTo(share, 7))
    })

    /**
     * The reference sample: the 814 symbols St1 and St2 share with no
     * edit between them, whose onsets put 45 beyond two deviations, 3
     * beyond three and none beyond four.
     */
    it('expects of 814 readings 37.0 beyond two deviations, 2.2 beyond three and 0.05 beyond four', () => {
        expect(814 * normalBeyond(2)).toBeCloseTo(37.0, 1)
        expect(814 * normalBeyond(3)).toBeCloseTo(2.2, 1)
        expect(814 * normalBeyond(4)).toBeCloseTo(0.05, 2)
    })
})

describe('how far a sample departs from the normal shape', () => {
    const standardised = (values: readonly Millimeters[]) => {
        const spread = spreadOf(values)!
        return values.map(value => standardise(value, spread))
    }

    it('reads no excess kurtosis off a normal sample', () => {
        expect(excessKurtosisOf(standardised(normalSample(1000, 0, 1)))).toBeCloseTo(0, 1)
    })

    it('reads a heavy tail off a sample with one', () => {
        const heavy = [...normalSample(950, 0, 1), ...Array.from({ length: 50 }, () => mm(5))]
        expect(excessKurtosisOf(standardised(heavy))).toBeGreaterThan(3)
    })

    it('counts what lies beyond a distance against what a normal sample would put there', () => {
        const tail = tailOf(standardised(normalSample(814, 0, 1)), 2)

        expect(tail.expected).toBeCloseTo(37.0, 1)
        expect(tail.observed).toBeGreaterThan(30)
        expect(tail.observed).toBeLessThan(45)
    })
})

describe('counting a sample into bins', () => {
    it('lays the bins out on multiples of their width, and counts every value into one', () => {
        const histogram = histogramOf([mm(-0.3), mm(0.1), mm(0.2), mm(0.6)], mm(0.25))!

        expect(histogram.edges).toEqual([-0.5, -0.25, 0, 0.25, 0.5, 0.75])
        expect(histogram.counts).toEqual([1, 0, 2, 0, 1])
        expect(histogram.counts.length).toBe(histogram.edges.length - 1)
    })

    it('keeps every value, the highest included', () => {
        const histogram = histogramOf(normalSample(500, 0, 1), mm(0.25))!
        expect(histogram.counts.reduce((total, count) => total + count, 0)).toBe(500)
    })

    it('is nothing for an empty sample or a width of nothing', () => {
        expect(histogramOf([], mm(0.25))).toBeUndefined()
        expect(histogramOf([mm(1)], mm(0))).toBeUndefined()
    })
})
