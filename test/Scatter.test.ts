import { describe, expect, it } from 'vitest'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { Millimeters, mm } from '../src/Quantity'
import { normalQuantile } from '../src/statistics'
import { admits, offsetEndOf, offsetStartOf } from '../src/Collation'
import {
    departureThreshold, inferredTolerance, readingsOf, Scatter, scatterOf, scatterOfCopy, toleranceAcross
} from '../src/scatter'
import { copy, editionOf, expression, hole, note, version } from './editionFixture'

const normalSample = (n: number, centre: number, sigma: number): number[] =>
    Array.from({ length: n }, (_, i) => centre + sigma * normalQuantile((i + 0.5) / n))

/**
 * One version whose notes two copies carry, the witness putting each of
 * them as far from the ground copy as the displacement says. The notes
 * stand far enough apart that none of them reaches another.
 */
const witnessed = (displacements: readonly number[], expressions: readonly number[] = []): Edition => {
    const at = (i: number) => 100 * i
    const notes = displacements.map((_, i) => note(`note-${i}`, 60, `ground-${i}`, `witness-${i}`))
    const controls = expressions.map((_, i) =>
        expression(`forzando-${i}`, 'ForzandoOn', `ground-f-${i}`, `witness-f-${i}`))

    return editionOf(
        [
            copy('ground', [
                ...displacements.map((_, i) => hole(`ground-${i}`, at(i), at(i) + 10, 47)),
                ...expressions.map((_, i) => hole(`ground-f-${i}`, at(i) + 50, at(i) + 52, 95))
            ]),
            copy('witness', [
                ...displacements.map((d, i) => hole(`witness-${i}`, at(i) + d, at(i) + 10 + d, 47)),
                ...expressions.map((d, i) => hole(`witness-f-${i}`, at(i) + 50 + d, at(i) + 52 + d, 95))
            ])
        ],
        [version('A', [{ type: 'edit', id: 'edit-a', insert: [...notes, ...controls] }])])
}

const scatterIn = (edition: Edition, group = 'note'): Scatter =>
    scatterOfCopy(new EditionView(edition), 'A', 'witness').find(scatter => scatter.group === group)!

describe('how far out a reading must lie to be a departure', () => {
    /**
     * The thresholds the edges of the welte225 stemma yield, against
     * the figures measured on that edition. The rule is the point
     * beyond which fewer than one reading of the sample is expected to
     * fall by chance, not a round three.
     */
    it('follows from the size of the sample, as the measured edges have it', () => {
        const measured: [number, number][] = [[459, 3.06], [203, 2.81], [462, 3.07], [489, 3.08], [443, 3.05], [322, 2.96]]
        measured.forEach(([n, k]) => expect(departureThreshold(n)).toBeCloseTo(k, 2))
    })

    it('stays a little above three over the sizes an edge of the stemma yields', () => {
        expect(departureThreshold(450)).toBeGreaterThan(3)
        expect(departureThreshold(800)).toBeCloseTo(3.227, 3)
        expect(departureThreshold(814)).toBeCloseTo(3.232, 3)
    })
})

describe('the scatter of one copy against the copies read with it', () => {
    it('recovers the offset and the scatter that were put there', () => {
        const scatter = scatterIn(witnessed(normalSample(400, 0.38, 0.9)))

        expect(scatter.spread.from.n).toBe(400)
        expect(scatter.spread.from.median).toBeCloseTo(0.38, 2)
        expect(scatter.spread.from.sigma).toBeCloseTo(0.9, 2)
        expect(scatter.spread.to.sigma).toBeCloseTo(0.9, 2)
    })

    it('makes the tolerance the threshold times the scatter, centred on the median', () => {
        const scatter = scatterIn(witnessed(normalSample(400, 0.38, 0.9)))

        expect(offsetStartOf(scatter.tolerance)).toBeCloseTo(0.38, 2)
        expect(scatter.tolerance.toleranceStart).toBeCloseTo(scatter.k * scatter.spread.from.sigma, 6)
        expect(scatter.tolerance.toleranceStart / scatter.spread.from.sigma).toBeCloseTo(scatter.k, 6)
    })

    it('leaves out a symbol only one side carries, so an insertion measures nothing', () => {
        const edition = witnessed(normalSample(50, 0, 0.5))
        edition.versions[0].edits![0].insert!.push(note('inserted', 61, 'witness-0'))

        const readings = readingsOf(new EditionView(edition), new EditionView(edition).snapshot('A'), new Set(['witness']))
        expect(readings.map(reading => reading.symbol.id)).not.toContain('inserted')
        expect(readings.length).toBe(50)
    })

    it('takes notes and expressions apart, since they scatter differently', () => {
        const edition = witnessed(normalSample(300, 0.2, 0.77), normalSample(300, 1.55, 1.38))
        const groups = scatterOfCopy(new EditionView(edition), 'A', 'witness')

        expect(groups.map(group => group.group).sort()).toEqual(['expression', 'note'])
        expect(scatterIn(edition, 'note').spread.from.sigma).toBeCloseTo(0.77, 2)
        expect(scatterIn(edition, 'expression').spread.from.sigma).toBeCloseTo(1.38, 2)
    })

    it('yields nothing for a sample whose readings all sit at one place', () => {
        expect(scatterOf(readingsOf(
            new EditionView(witnessed([0, 0, 0, 0])),
            new EditionView(witnessed([0, 0, 0, 0])).snapshot('A'),
            new Set(['witness'])))).toEqual([])
    })
})

describe('the readings the tolerance does not admit', () => {
    /** A sample of ordinary scatter with one reading pulled well clear of it. */
    const planted = () => {
        const displacements = normalSample(400, 0.38, 0.9)
        return witnessed([...displacements.slice(0, 399), 6])
    }

    it('names the one pulled clear of the scatter, and says how far out it lies', () => {
        const scatter = scatterIn(planted())
        const departure = scatter.departures.find(candidate => candidate.symbol === 'note-399')!

        expect(departure.displacement.from).toBeCloseTo(6, 6)
        expect(departure.z.from).toBeGreaterThan(5)
        expect(scatter.departures[0].symbol).toBe('note-399')
    })

    /**
     * A whole punch displaced departs at both ends; a punch of another
     * length departs at the end alone, which is as often a measurement
     * failing as a command prolonged.
     */
    it('says which end put the reading outside the window', () => {
        const displacements = normalSample(400, 0, 0.9)
        const edition = witnessed([...displacements.slice(0, 399), 0])
        const stretched = edition.copies[1].production!.produced!.find(f => f.id === 'witness-399')!
        stretched.horizontal.to = mm(stretched.horizontal.to + 6)

        const departure = scatterIn(edition).departures.find(d => d.symbol === 'note-399')!
        expect(departure.separatedBy).toEqual({ from: false, to: true })
    })

    it('keeps the ordinary scatter out of the list, but does not promise only the planted one', () => {
        const departures = scatterIn(planted()).departures
        expect(departures.length).toBeLessThan(6)
        expect(departures.map(departure => departure.symbol)).toContain('note-399')
    })

    it('says whether the tolerance stated at present still admits each of them', () => {
        const view = new EditionView(planted())
        const stated = { toleranceStart: mm(8), toleranceEnd: mm(8) }
        const scatter = scatterOfCopy(view, 'A', 'witness', { stated })
            .find(group => group.group === 'note')!

        expect(scatter.departures.every(departure => departure.admittedAsStated)).toBe(true)
        expect(scatter.departures[0].admittedAsStated).toBe(true)
    })

    it('reports how far the sample departs from the normal shape it assumes', () => {
        const normality = scatterIn(witnessed(normalSample(814, 0, 1))).normality.from

        expect(normality.excessKurtosis).toBeCloseTo(0, 1)
        expect(normality.tails.map(tail => tail.beyond)).toEqual([2, 3, 4])
        expect(normality.tails[0].expected).toBeCloseTo(37.0, 1)
        expect(normality.tails[2].observed).toBe(0)
    })
})

describe('the histogram the scatter is drawn as', () => {
    it('counts the whole sample, and carries the curve to lay over it', () => {
        const scatter = scatterIn(witnessed(normalSample(400, 0.38, 0.9)))
        const { counts, edges, curve } = scatter.histogram.from

        expect(counts.reduce((total, count) => total + count, 0)).toBe(400)
        expect(edges.length).toBe(counts.length + 1)
        expect(curve.centre).toBe(scatter.spread.from.median)
        expect(curve.sigma).toBe(scatter.spread.from.sigma)
        expect(curve.area).toBeCloseTo(400 * 0.25, 6)
    })

    it('draws a curve whose peak matches the tallest bin', () => {
        const { counts, curve } = scatterIn(witnessed(normalSample(400, 0.38, 0.9))).histogram.from
        const peak = curve.area / (curve.sigma * Math.sqrt(2 * Math.PI))

        expect(peak).toBeGreaterThan(Math.max(...counts) * 0.8)
        expect(peak).toBeLessThan(Math.max(...counts) * 1.25)
    })
})

describe('one tolerance over samples that scatter differently', () => {
    const bothSamples = (): Scatter[] =>
        scatterOfCopy(
            new EditionView(witnessed(normalSample(300, 0.2, 0.77), normalSample(300, 1.55, 1.38))),
            'A', 'witness')

    it('admits the whole reach of each sample, notes and expressions alike', () => {
        const covering = toleranceAcross(bothSamples())!

        bothSamples().forEach(({ tolerance }) => {
            const atStart = (from: Millimeters) => ({ from, to: offsetEndOf(tolerance) })
            expect(admits(covering, atStart(mm(offsetStartOf(tolerance) + tolerance.toleranceStart)))).toBe(true)
            expect(admits(covering, atStart(mm(offsetStartOf(tolerance) - tolerance.toleranceStart)))).toBe(true)
        })
    })

    it('is no wider than it must be, taking the widest sample where they share a centre', () => {
        const covering = toleranceAcross(bothSamples())!
        const widest = Math.max(...bothSamples().map(({ tolerance }) => tolerance.toleranceStart))

        expect(covering.toleranceStart).toBeGreaterThanOrEqual(widest)
        expect(covering.toleranceStart).toBeLessThan(widest * 2)
    })

    it('is nothing where there is no sample', () => {
        expect(toleranceAcross([])).toBeUndefined()
    })
})

describe('the warrant a calculated tolerance carries', () => {
    const belief = () => inferredTolerance(
        scatterOfCopy(new EditionView(witnessed(normalSample(400, 0.38, 0.9))), 'A', 'witness'),
        ['witness'])

    it('is an inference held likely rather than true, the sample being normal only so far', () => {
        expect(belief().certainty).toBe('likely')
        expect(belief().reasons[0].type).toBe('inference')
    })

    it('states the sample it was drawn from, the scatter and the rule that fixed the threshold', () => {
        const note = belief().reasons[0].note!

        expect(note).toMatch(/400 readings/)
        expect(note).toMatch(/median absolute deviation/)
        expect(note).toMatch(/fewer than one reading/)
    })

    it('names what it worked on, the premises being measurements and no beliefs of their own', () => {
        const reason = belief().reasons[0]

        expect(reason.type === 'inference' && reason.used).toEqual(['witness'])
        expect(reason.type === 'inference' && reason.premises).toEqual([])
    })
})
