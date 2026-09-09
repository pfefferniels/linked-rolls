import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { RollCopy } from '../src/RollCopy'
import { FeatureSource } from '../src/FeatureSource'
import { reservationsAbout, ReservationType } from '../src/reservations'
import { clearSource, stateSource } from '../src/editionOps'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { assignValue } from '../src/Assumption'
import { mm, px, track } from '../src/Quantity'
import { copy, editionOf } from './editionFixture'
import { systemOf } from '../src/TrackerBar'
import { welteT98 } from '../src/systems/welteT98/bar'

const scanned = (source: FeatureSource): RollCopy => ({
    ...copy('scanned', []),
    readFrom: source,
    measurements: {
        holeSeparation: { unit: 'px', value: px(37.7) },
        margins: { unit: 'px', treble: px(10), bass: px(20) },
        measuredBy: { software: 'SUPRA', version: '1.0', date: new Date('2020-01-01') }
    }
})

const typesOf = (copy: RollCopy): ReservationType[] =>
    reservationsAbout(copy).map(reservation => reservation.type)

describe('reservations about a copy', () => {
    it('reports a copy that says nothing about its source', () => {
        expect(typesOf(copy('bare', []))).toContain('source-not-stated')
    })

    it('says nothing about the source of a fully documented scan', () => {
        const documented = scanned({
            kind: 'scan',
            device: { name: 'Kodak i5850', sameAs: [] },
            date: assignValue(new Date('2019-06-01'))
        })

        expect(typesOf(documented)).toEqual([])
    })

    it('reports a source whose making is undocumented', () => {
        expect(typesOf(scanned({ kind: 'scan' }))).toEqual(['source-undocumented'])
    })

    it('holds the features of an emulated MIDI to be somebody else\'s reading', () => {
        const emulated = scanned({
            kind: 'emulation',
            output: 'https://example.org/wm225.mid',
            date: assignValue(new Date('2015-01-01'))
        })

        expect(typesOf(emulated)).toEqual(['features-interpreted', 'no-physical-evidence'])
    })

    it('keeps the physical evidence of an analysis while denying it to a recording', () => {
        const analysed = scanned({ kind: 'analysis', date: assignValue(new Date()) })
        const recorded = scanned({ kind: 'recording', date: assignValue(new Date()) })

        expect(typesOf(analysed)).toEqual(['no-physical-evidence'])
        expect(typesOf(recorded)).toEqual(['features-interpreted', 'no-physical-evidence'])
    })

    it('expects no measuring software where the roll itself was measured', () => {
        const byHand: RollCopy = {
            ...copy('by-hand', []),
            readFrom: { kind: 'roll', date: assignValue(new Date('2021-01-01')) },
            measurements: { trackCalibration: { unit: 'mm', offset: mm(1), separation: 3, shift: track(0) } }
        }

        expect(typesOf(byHand)).toEqual([])
    })

    it('reports a copy with neither software nor calibration', () => {
        expect(typesOf(copy('bare', []))).toEqual([
            'source-not-stated',
            'measurement-undocumented',
            'not-calibrated'
        ])
    })

    it('reports a copy the edition cannot place in a system', () => {
        const { production: _named, ...unplaced } = copy('unplaced', [])
        expect(typesOf(unplaced)).toContain('system-unknown')

        const foreign: RollCopy = {
            ...copy('foreign', []),
            production: { system: { id: 'https://example.org/system/duo-art', name: 'Duo-Art', sameAs: [] } }
        }
        expect(typesOf(foreign)).toContain('system-unknown')
    })

    it('says nothing about a copy that names a system it has a bar for', () => {
        const green: RollCopy = {
            ...copy('green', []),
            production: { system: systemOf(welteT98) }
        }
        expect(typesOf(green)).not.toContain('system-unknown')
    })

    it('goes away once the gap is filled', () => {
        const undocumented = scanned({ kind: 'scan' })
        const filled: RollCopy = {
            ...undocumented,
            readFrom: { ...undocumented.readFrom!, date: assignValue(new Date('2019-06-01')) }
        }

        expect(typesOf(filled)).toEqual([])
    })
})

describe('stating the source of a copy', () => {
    const edition = () => editionOf([copy('first', [])], [])

    it('states and clears it', () => {
        const stated = produce(edition(), stateSource('first', { kind: 'analysis' }))
        expect(stated.copies[0].readFrom).toEqual({ kind: 'analysis' })

        const cleared = produce(stated, clearSource('first'))
        expect(cleared.copies[0].readFrom).toBeUndefined()
    })

    it('leaves an edition without that copy alone', () => {
        const before = edition()
        expect(produce(before, stateSource('absent', { kind: 'scan' }))).toEqual(before)
    })

    it('survives an export and a re-import', async () => {
        const source: FeatureSource = {
            kind: 'emulation',
            output: 'https://example.org/wm225.mid',
            note: 'MIDI from a third party; the emulator is not named.',
            // The format carries a date as YYYY-MM-DD in local time, so only a local midnight round-trips.
            date: assignValue(new Date(2015, 0, 1))
        }
        const stated = produce(edition(), stateSource('first', source))

        const reimported = await importJsonLd(JSON.parse(JSON.stringify(asJsonLd(stated))))

        expect(reimported.copies[0].readFrom).toEqual(source)
    })
})
