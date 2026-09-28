import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import jsonld from 'jsonld'
import { produce } from 'immer'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import { Edition } from '../src/model/Edition'
import { Alignment, featuresOf, isTear, Tear, tearsOf } from '../src/model/RollCopy'
import { assignObject, ObjectAssumption } from '../src/model/Assumption'
import { addGeneralCondition, addTear, unalignCopy } from '../src/ops'
import { applyAlignment } from '../src/collation/alignment'
import { readFromStanfordAton } from '../src/readers/stanfordAton'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { inMillimeters, mm, px, track } from '../src/model/Quantity'
import { copy, editionOf, hole } from './editionFixture'

/**
 * A tear is a condition of the copy (P44 has condition) that holds for
 * one stretch of the roll alone. It states that stretch as the copy's
 * features state theirs, so that it moves with them.
 */

const tear = (from: number, to: number, edge: 'bass' | 'treble' = 'bass'): ObjectAssumption<Tear> =>
    assignObject<Tear>({
        conditionType: 'torn',
        horizontal: { unit: 'mm', from: mm(from), to: mm(to) },
        edge,
        depth: { value: mm(5.9), unit: 'mm' }
    })

const withTear = (): Edition => {
    const edition = editionOf([copy('first', [hole('hole', 1000, 1010, 47)])], [])
    edition.copies[0].conditions = [tear(1100, 1150)]
    return edition
}

describe('adding a tear to a copy', () => {
    it('adds it beside what is stated of the copy already', () => {
        const wear = assignObject({ conditionType: 'general' as const, description: 'browned' })
        const before = produce(withTear(), addGeneralCondition('first', wear))
        const next = produce(before, addTear('first', tear(2000, 2010, 'treble')))

        expect(next.copies[0].conditions).toEqual([tear(1100, 1150), wear, tear(2000, 2010, 'treble')])
        expect(tearsOf(next.copies[0])).toEqual([tear(1100, 1150), tear(2000, 2010, 'treble')])
    })

    it('leaves the edition as it is for a copy it does not have', () => {
        const before = withTear()
        expect(produce(before, addTear('nothing', tear(1, 2)))).toBe(before)
    })
})

describe('aligning a copy with tears', () => {
    const alignment: Alignment = { shift: { horizontal: mm(2), vertical: track(1) }, scale: 1.5 }
    const aligned = () => produce(withTear(), draft => { applyAlignment(alignment, draft.copies[0]) })

    it('moves the tears with the features along the roll', () => {
        const [moved] = tearsOf(aligned().copies[0])

        expect(featuresOf(aligned().copies[0])[0].horizontal).toEqual({ unit: 'mm', from: 1503, to: 1518 })
        expect(moved.horizontal).toEqual({ unit: 'mm', from: 1653, to: 1728 })
    })

    it('leaves the edge and the depth of a tear to the shift across the roll', () => {
        const [moved] = tearsOf(aligned().copies[0])

        expect(featuresOf(aligned().copies[0])[0].vertical.from).toBe(48)
        expect(moved.edge).toBe('bass')
        expect(moved.depth).toEqual({ value: 5.9, unit: 'mm' })
    })

    it('puts the tears back by unaligning', () => {
        const next = produce(aligned(), unalignCopy('first'))
        const [back] = tearsOf(next.copies[0])

        expect(next.copies[0].conditions).toHaveLength(1)
        expect(back.horizontal.from).toBeCloseTo(1100)
        expect(back.horizontal.to).toBeCloseTo(1150)
    })

    it('writes the tears at the copy\'s own places, where the features are written', () => {
        const [written] = asJsonLd(aligned()).copies[0].conditions
        expect(written.horizontal).toEqual({ unit: 'mm', from: 1100, to: 1150 })
        expect(tearsOf(importJsonLd(asJsonLd(aligned())).copies[0])[0].horizontal).toEqual({ unit: 'mm', from: 1653, to: 1728 })
    })
})

describe('reading the tears of a Stanford analysis', () => {
    const aton = readFileSync(path.join(__dirname, 'fixtures', 'mf320jq4997_analysis.txt'), 'utf8')

    /** Two of the tears the analysis of wv912mm2332 lists on the bass edge and one on the treble, given to this file. */
    const tears = `
@@BEGIN: TEARS
@@BEGIN: TREBLE_TEARS
@@BEGIN: TEAR
@ID:		trebletear001
@ORIGIN_ROW:	94726px
@ORIGIN_COL:	3877px
@WIDTH_ROW:	513px
@WIDTH_COL:	59px
@AREA:		16273px
@@END: TEAR
@@END: TREBLE_TEARS

@@BEGIN: BASS_TEARS
@@BEGIN: TEAR
@ID:		basstear004
@ORIGIN_ROW:	115361px
@ORIGIN_COL:	36px
@WIDTH_ROW:	255px
@WIDTH_COL:	30px
@AREA:		2870px
@@END: TEAR
@@BEGIN: TEAR
@ID:		basstear001
@ORIGIN_ROW:	108514px
@ORIGIN_COL:	34px
@WIDTH_ROW:	584px
@WIDTH_COL:	70px
@AREA:		26639px
@@END: TEAR
@@END: BASS_TEARS
@@END: TEARS
`
    const torn = aton.replace('@@END: ROLLINFO', `${tears}\n@@END: ROLLINFO`)
    const dpi = parseFloat(/@LENGTH_DPI:\s*([\d.]+)/.exec(aton)![1])

    it('states each tear as a condition of the copy, in the order they come along the roll', () => {
        const read = readFromStanfordAton(torn)
        expect(read.conditions.map(condition => isTear(condition) && [condition.edge, condition.horizontal.from]))
            .toEqual([
                ['treble', inMillimeters(px(94726), dpi)],
                ['bass', inMillimeters(px(108514), dpi)],
                ['bass', inMillimeters(px(115361), dpi)]
            ])
    })

    it('measures a tear along the roll as the holes are measured, and across it as deep as it runs in', () => {
        const [, deepest] = tearsOf(readFromStanfordAton(torn))

        expect(deepest.horizontal).toEqual({
            unit: 'mm',
            from: inMillimeters(px(108514), dpi),
            to: inMillimeters(px(108514 + 584), dpi)
        })
        expect(deepest.depth).toEqual({ value: inMillimeters(px(70), dpi), unit: 'mm' })
        expect(deepest.depiction).toBe(
            'https://stacks.stanford.edu/image/iiif/mf320jq4997/mf320jq4997_0001/34,108514,70,584/128,/270/default.jpg')
    })

    it('states no tear where the analysis lists none', () => {
        expect(readFromStanfordAton(aton).conditions).toEqual([])
    })
})

describe('a tear in the export', () => {
    const base = 'https://example.org/edition/'
    const crm = 'http://www.cidoc-crm.org/cidoc-crm/'
    const reo = 'https://w3id.org/reo/'
    const reot = 'https://w3id.org/reo/type/'

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
        const edition = withTear()
        edition.base = base
        return JSON.parse(JSON.stringify(asJsonLd(edition)))
    }

    it('holds against the schema, and reads back unchanged', () => {
        expect(validate(exported())).toBe(true)
        expect(importJsonLd(exported()).copies[0].conditions).toEqual(withTear().copies[0].conditions)
    })

    it('is turned down without a place along the roll', () => {
        const document = exported()
        delete document.copies[0].conditions[0].horizontal
        expect(validate(document)).toBe(false)
    })

    it('is a condition state of the copy, typed torn, with its place, edge and depth', async () => {
        const [node] = await jsonld.expand(exported(), { documentLoader }) as any[]
        const [copied] = node[`${reo}witness`]
        const [state] = copied[`${crm}P44_has_condition`]

        expect(state[`${crm}P2_has_type`]).toEqual([{ '@id': `${reot}torn` }])
        expect(state[`${reo}edge`]).toEqual([{ '@id': `${reot}bass` }])
        expect(state[`${reo}horizontal`][0][`${reo}from`]).toEqual([{ '@value': 1100 }])
        expect(state[`${reo}horizontal`][0][`${reo}to`]).toEqual([{ '@value': 1150 }])
        expect(state[`${reo}depth`][0][`${crm}P90_has_value`]).toEqual([{ '@value': 5.9 }])
        expect(state[`${crm}P43_has_dimension`]).toBeUndefined()
    })

    it('leaves the extent of a feature stated with P43 has dimension', async () => {
        const [node] = await jsonld.expand(exported(), { documentLoader }) as any[]
        const [copied] = node[`${reo}witness`]
        const [production] = copied['http://iflastandards.info/ns/lrm/lrmoo/R28i_was_produced_by']
        const [chain] = production[`${reo}produced`]

        expect(chain[`${crm}P43_has_dimension`]).toHaveLength(2)
        expect(chain[`${reo}horizontal`]).toBeUndefined()
    })
})
