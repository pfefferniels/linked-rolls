import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import { asJsonLd } from '../src/io/asJsonLd'
import { validate } from '../src/validate'
import { Edition } from '../src/model/Edition'
import { PaperSpeed, PaperStretch, RollCopy } from '../src/model/RollCopy'
import { assignObject } from '../src/model/Assumption'
import { alignmentProblems, PAPER_SPREAD, paperOf, SPEED_TOLERANCE } from '../src/analysis/paper'
import { feetPerMinute, metersPerMinute, mm, percent, track } from '../src/model/Quantity'
import { systemOf } from '../src/systems/TrackerBar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { copy, cutFor, editionOf, hole } from './editionFixture'

/** A copy with one hole, aligned onto the axis by the scale given, against the reference copy. */
const aligned = (id: string, scale: number, scaleError = 2e-5): RollCopy => ({
    ...copy(id, [hole(`${id}-hole`, 1000, 1010, 47)]),
    measurements: {
        alignment: { against: 'St1', shift: { horizontal: mm(0), vertical: track(0) }, scale, scaleError: scale * scaleError }
    }
})

const licensee = (copy: RollCopy): RollCopy => cutFor(copy, systemOf(welteLicensee))

/** The red and Licensee copies of Welte 225 as their alignments put them. */
const welte225 = (): Edition => ({
    ...editionOf([
        copy('St1', [hole('St1-hole', 1000, 1010, 47)]),
        aligned('St2', 0.9978034872721986),
        aligned('Wi1', 1.0016647616495822),
        licensee(aligned('Ch1', 1.3011593658380265, 3e-5))
    ], []),
    referenceCopy: 'St1'
})

const paperIn = (edition: Edition, id: string) => paperOf(edition)!.copies.find(paper => paper.copy === id)!
const systemIn = (edition: Edition, id: string) => paperOf(edition)!.systems.find(paper => paper.system === id)!

describe('what the alignments say about the paper', () => {
    it('puts the red copies about their mean paper, which the axis is not quite', () => {
        const strains = ['St1', 'St2', 'Wi1'].map(id => paperIn(welte225(), id).along.value)
        expect(strains.reduce((sum, strain) => sum + strain, 0)).toBeCloseTo(0, 3)
        expect(paperIn(welte225(), 'St2').along.value).toBeCloseTo(0.2021, 3)
        expect(paperIn(welte225(), 'St1').along.value).toBeCloseTo(-0.0179, 3)
    })

    it('takes the spread of paper from the copies of one system where there are enough', () => {
        const { spread } = paperOf(welte225())!
        expect(spread.degreesOfFreedom).toBe(2)
        expect(spread.value).toBeCloseTo(0.194, 2)
    })

    it('knows a copy\'s strain no better than paper varies where nothing else tells it', () => {
        const ch1 = paperIn(welte225(), 'Ch1')
        expect(ch1.along.value).toBeCloseTo(0, 6)
        expect(ch1.along.uncertainty).toBeCloseTo(paperOf(welte225())!.spread.value, 3)
        expect(ch1.measured).toBe(false)
    })

    it('gives the ratio of the Licensee paper to the red, and how surely', () => {
        const paper = systemIn(welte225(), 'welte-licensee')
        expect(paper.ratio).toBeCloseTo(0.99982 / 1.3011594, 5)
        expect(paper.ratioError / paper.ratio).toBeCloseTo(0.0021, 3)
        expect(paper.copies).toEqual(['Ch1'])
    })

    it('takes a version of either system to its own paper, unstretched', () => {
        expect(systemIn(welte225(), 'welte-t100').toOwnPaper).toBeCloseTo(1.000179, 6)
        expect(systemIn(welte225(), 'welte-licensee').toOwnPaper).toBeCloseTo(1 / 1.3011594, 6)
    })

    it('goes by a strain measured on a copy, as far as its uncertainty allows', () => {
        const edition = welte225()
        edition.copies[0].conditions = [assignObject<PaperStretch>({
            conditionType: 'paper-stretch',
            along: { value: percent(0.1), uncertainty: percent(0.01), unit: 'percent' }
        })]
        expect(paperIn(edition, 'St1').along.value).toBeCloseTo(0.1, 1)
        expect(paperIn(edition, 'St1').measured).toBe(true)
        expect(systemIn(edition, 'welte-t100').toOwnPaper).toBeCloseTo(1 / 1.001, 3)
    })

    it('leaves out a strain the edition does not hold', () => {
        const edition = welte225()
        edition.copies[0].conditions = [{
            ...assignObject<PaperStretch>({ conditionType: 'paper-stretch', along: { value: percent(5), uncertainty: percent(0.01), unit: 'percent' } }),
            '@annotation': { id: 'a', belief: { id: 'b', type: 'belief', certainty: 'unlikely', reasons: [] } }
        }]
        expect(paperIn(edition, 'St1').measured).toBe(false)
    })

    it('leaves out a copy read by a roll reader, whose places are times', () => {
        const edition = welte225()
        edition.copies.push({ ...licensee(aligned('Ne1', 1.0000136)), readFrom: { kind: 'reading' } })
        expect(paperOf(edition)!.copies.map(paper => paper.copy)).not.toContain('Ne1')
        expect(systemIn(edition, 'welte-licensee').copies).toEqual(['Ch1'])
    })

    it('says nothing without a reference copy', () => {
        expect(paperOf(editionOf([], []))).toBeUndefined()
    })

    it('holds the spread at its default for want of copies of one system', () => {
        const edition = welte225()
        edition.copies.splice(1, 2)
        expect(paperOf(edition)!.spread).toEqual({ value: expect.closeTo(PAPER_SPREAD, 9), degreesOfFreedom: 0 })
    })
})

describe('the problems of the alignments', () => {
    it('finds none in copies that agree', () => {
        expect(alignmentProblems(welte225())).toEqual([])
    })

    it('reports a copy with features that is not aligned', () => {
        const edition = welte225()
        edition.copies.push(copy('loose', [hole('loose-hole', 1000, 1010, 47)]))
        expect(alignmentProblems(edition)).toEqual([{ copy: 'loose', problem: 'not-aligned' }])
    })

    it('reports a copy aligned against another than the reference copy', () => {
        const edition = { ...welte225(), referenceCopy: 'St2' }
        edition.copies[1] = copy('St2', [hole('St2-hole', 1000, 1010, 47)])
        const problems = alignmentProblems(edition)
        expect(problems.filter(p => p.problem === 'aligned-against-another-copy').map(p => p.copy))
            .toEqual(['Wi1', 'Ch1'])
    })

    it('reports a speed stated for a copy that the paper does not bear out', () => {
        const edition = welte225()
        edition.copies[3].production = {
            ...edition.copies[3].production,
            speed: assignObject<PaperSpeed>({ value: feetPerMinute(8.3), unit: 'ft/min' })
        }
        const [problem] = alignmentProblems(edition)
        expect(problem.problem).toBe('speed-disagrees-with-paper')
        expect(problem.copy).toBe('Ch1')
        expect(problem.by).toBeCloseTo(Math.log((8.3 * 0.3048 / 3) / (0.99982 / 1.3011594)), 4)
    })

    it('leaves a speed that the paper bears out within what a stated speed may be off', () => {
        const edition = welte225()
        const near = 3 / 1.3011594 * (1 + SPEED_TOLERANCE / 2)
        edition.copies[3].production = {
            ...edition.copies[3].production,
            speed: assignObject<PaperSpeed>({ value: metersPerMinute(near), unit: 'm/min' })
        }
        expect(alignmentProblems(edition)).toEqual([])
    })

    it('reports a copy whose paper strays from its system\'s by more than paper does', () => {
        const edition = welte225()
        edition.copies.push(licensee(aligned('Ch2', 1.40)))
        const strays = alignmentProblems(edition).filter(p => p.problem === 'paper-beyond-its-spread')
        expect(strays.map(p => p.copy).sort()).toEqual(['Ch1', 'Ch2'])
    })
})

describe('a strain measured on a copy, in the export', () => {
    const crm = 'http://www.cidoc-crm.org/cidoc-crm/'
    const reo = 'https://w3id.org/reo/'

    const contexts: Record<string, unknown> = {
        'https://w3id.org/reo/context.jsonld': context,
        'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context
    }
    const documentLoader = async (url: string) => {
        const document = contexts[url]
        if (!document) throw new Error(`no local copy of ${url}`)
        return { contextUrl: undefined, documentUrl: url, document }
    }

    const exported = () => {
        const edition = { ...welte225(), base: 'https://example.org/edition/' }
        edition.copies[0].conditions = [assignObject<PaperStretch>({
            conditionType: 'paper-stretch',
            along: { value: percent(0.1), uncertainty: percent(0.02), unit: 'percent' },
            across: { value: percent(-0.05), unit: 'percent' }
        })]
        return JSON.parse(JSON.stringify(asJsonLd(edition)))
    }

    it('holds against the schema', () => {
        expect(validate(exported())).toBe(true)
    })

    it('is a dimension of the condition state in either direction, with its uncertainty', async () => {
        const [node] = await jsonld.expand(exported(), { documentLoader }) as any[]
        const [copied] = node[`${reo}witness`]
        const [state] = copied[`${crm}P44_has_condition`]

        expect(state[`${reo}strainAlong`][0][`${crm}P90_has_value`]).toEqual([{ '@value': 0.1 }])
        expect(state[`${reo}strainAlong`][0][`${reo}uncertainty`]).toEqual([{ '@value': 0.02 }])
        expect(state[`${reo}strainAlong`][0][`${crm}P91_has_unit`]).toEqual([{ '@id': `${reo}type/percent` }])
        expect(state[`${reo}strainAcross`][0][`${crm}P90_has_value`]).toEqual([{ '@value': -0.05 }])
    })

    it('leaves the alignment out of RDF', async () => {
        const [node] = await jsonld.expand(exported(), { documentLoader }) as any[]
        const [, aligned] = node[`${reo}witness`]
        expect(JSON.stringify(aligned)).not.toContain('0.9978')
    })
})
