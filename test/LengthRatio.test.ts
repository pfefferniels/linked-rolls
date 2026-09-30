import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { Edition } from '../src/model/Edition'
import { RollCopy } from '../src/model/RollCopy'
import { assignDate, Measurement } from '../src/model/Assumption'
import { lengthRatioOf, paperOf } from '../src/analysis/paper'
import { mm, track } from '../src/model/Quantity'
import { systemOf } from '../src/systems/TrackerBar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { copy, cutFor, editionOf, hole, note, version } from './editionFixture'

/**
 * A version re-cut for a system whose paper runs slower comes out shorter
 * by the ratio of the speeds. The alignments measure that ratio, and the
 * creation of the version states it, so that it can serve as a premise.
 */

/** A copy with one hole, aligned onto the axis by the scale given, against the reference copy. */
const aligned = (id: string, scale: number, scaleError = 2e-5): RollCopy => ({
    ...copy(id, [hole(`${id}-hole`, 1000, 1010, 47)]),
    measurements: {
        alignment: { against: 'St1', shift: { horizontal: mm(0), vertical: track(0) }, scale, scaleError: scale * scaleError }
    }
})

const licensee = (copy: RollCopy): RollCopy => cutFor(copy, systemOf(welteLicensee))

/**
 * The red copies of Welte 225 carrying version A, the Licensee copy Ch1
 * carrying L, re-cut from A, and a second Licensee re-cut M, from A as
 * well, whose one copy was read by a machine that measures no paper.
 */
const welte225 = (): Edition => ({
    ...editionOf([
        copy('St1', [hole('St1-hole', 1000, 1010, 47)]),
        aligned('St2', 0.9978034872721986),
        aligned('Wi1', 1.0016647616495822),
        licensee(aligned('Ch1', 1.3011593658380265, 3e-5)),
        licensee(copy('Ne1', [hole('Ne1-hole', 1000, 1010, 47)]))
    ], [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('red', 60, 'St1-hole', 'St2-hole', 'Wi1-hole')] }]),
        {
            ...version('L', [{ type: 'edit', id: 'edit-l', insert: [note('recut', 62, 'Ch1-hole')] }], 'A'),
            system: systemOf(welteLicensee)
        },
        {
            ...version('M', [{ type: 'edit', id: 'edit-m', insert: [note('other-recut', 64, 'Ne1-hole')] }], 'A'),
            system: systemOf(welteLicensee)
        }
    ]),
    referenceCopy: 'St1'
})

/** What the alignments found, as the measurement a length ratio is held on the strength of. */
const aligning: Measurement = {
    type: 'measurement',
    note: 'the paper of the Licensee copies against the red, from all alignments of the edition together',
    used: ['St1', 'St2', 'Wi1', 'Ch1'],
    procedure: { name: 'least squares over the scales of the alignments', sameAs: [] },
    software: [{ name: 'linked-rolls', version: '0.66.0' }],
    date: assignDate(new Date(2026, 8, 30))
}

/** The edition with the re-cut of L stating the ratio its copies give. */
const stated = (): Edition => {
    const ratio = lengthRatioOf(welte225(), 'L')!
    const edition = welte225()
    edition.versions[1].creation = {
        lengthRatio: {
            ...ratio,
            '@annotation': {
                id: 'ratio-annotation',
                belief: { type: 'belief', id: 'ratio-belief', certainty: 'likely', reasons: [aligning] }
            }
        }
    }
    return edition
}

describe('the length ratio of a re-cut', () => {
    it('is the ratio of the Licensee paper to the red, which the alignments give', () => {
        const edition = welte225()
        const paper = paperOf(edition)!.systems.find(system => system.system === 'welte-licensee')!
        const ratio = lengthRatioOf(edition, 'L')!
        expect(ratio.value).toBeCloseTo(paper.ratio, 12)
        expect(ratio.uncertainty).toBeCloseTo(paper.ratioError, 12)
        expect(ratio.value).toBeCloseTo(0.7684, 3)
    })

    it('is not credited to a second re-cut for the same system whose copies measure no paper', () => {
        expect(lengthRatioOf(welte225(), 'M')).toBeUndefined()
    })

    it('is not given for a version that derives from none', () => {
        expect(lengthRatioOf(welte225(), 'A')).toBeUndefined()
    })

    it('is valid where the creation states it, and comes back from an export as it went in', () => {
        expect(validate(asJsonLd(stated()))).toBe(true)
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(stated()))))
        expect(back.versions[1].creation).toEqual(stated().versions[1].creation)
    })

    it('reads as a dimension of the creation, with its value and uncertainty', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/L',
            creation: { lengthRatio: { value: 0.7684, uncertainty: 0.0017 } }
        }) as any[]
        const [creation] = node['http://iflastandards.info/ns/lrm/lrmoo/R17i_was_created_by']
        const [ratio] = creation['https://w3id.org/reo/lengthRatio']
        expect(ratio['http://www.cidoc-crm.org/cidoc-crm/P90_has_value']).toEqual([{ '@value': 0.7684 }])
        expect(ratio['https://w3id.org/reo/uncertainty']).toEqual([{ '@value': 0.0017 }])
    })
})
