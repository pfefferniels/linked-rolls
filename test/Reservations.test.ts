import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { RollCopy } from '../src/model/RollCopy'
import { FeatureSource } from '../src/model/FeatureSource'
import { reservationsAbout, ReservationType } from '../src/analysis/reservations'
import { clearSource, stateSource } from '../src/ops'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { assignDate } from '../src/model/Assumption'
import { mm, px, track } from '../src/model/Quantity'
import { copy, cutFor, editionOf, hole } from './editionFixture'
import { systemOf } from '../src/systems/TrackerBar'
import { welteT98 } from '../src/systems/welteT98/bar'

/** A copy with a feature to read, which the checks on measurement and system are about. */
const holed = (id: string): RollCopy => copy(id, [hole(`${id}-hole`, 1000, 1010, 47)])

const scanned = (source: FeatureSource): RollCopy => ({
    ...holed('scanned'),
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
            date: assignDate(new Date('2019-06-01'))
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
            date: assignDate(new Date('2015-01-01'))
        })

        expect(typesOf(emulated)).toEqual(['software-not-named', 'features-interpreted', 'no-physical-evidence'])
        expect(typesOf({ ...emulated, readFrom: { ...emulated.readFrom!, software: [{ name: 'midi2exp' }] } }))
            .toEqual(['features-interpreted', 'no-physical-evidence'])
    })

    it('keeps the physical evidence of an analysis while denying it to a roll reader, whose switches it measures', () => {
        const analysed = scanned({ kind: 'analysis', date: assignDate(new Date()) })
        const read = scanned({ kind: 'reading', date: assignDate(new Date()) })

        expect(typesOf(analysed)).toEqual(['no-physical-evidence'])
        expect(typesOf(read)).toEqual(['no-physical-evidence'])
    })

    it('expects no measuring software where the roll itself was measured', () => {
        const byHand: RollCopy = {
            ...holed('by-hand'),
            readFrom: { kind: 'roll', date: assignDate(new Date('2021-01-01')) },
            measurements: { trackCalibration: { unit: 'mm', offset: mm(1), separation: 3, shift: track(0) } }
        }

        expect(typesOf(byHand)).toEqual([])
    })

    it('reports a copy with neither software nor calibration', () => {
        expect(typesOf(holed('bare'))).toEqual([
            'source-not-stated',
            'measurement-undocumented',
            'not-calibrated'
        ])
    })

    it('reports a copy the edition cannot place in a system', () => {
        expect(typesOf(cutFor(holed('unplaced'), undefined))).toContain('system-unknown')

        const duoArt = { id: 'https://example.org/system/duo-art', name: 'Duo-Art', sameAs: [] }
        expect(typesOf(cutFor(holed('foreign'), duoArt))).toContain('system-unknown')
    })

    it('says nothing about a copy that names a system it has a bar for', () => {
        expect(typesOf(cutFor(holed('green'), systemOf(welteT98)))).not.toContain('system-unknown')
    })

    it('goes away once the gap is filled', () => {
        const undocumented = scanned({ kind: 'scan' })
        const filled: RollCopy = {
            ...undocumented,
            readFrom: { ...undocumented.readFrom!, date: assignDate(new Date('2019-06-01')) }
        }

        expect(typesOf(filled)).toEqual([])
    })
})

describe('reservations about a copy known only from a recording', () => {
    const recorded = (source: Omit<FeatureSource, 'kind'>): RollCopy => ({
        ...copy('recorded', []),
        readFrom: { kind: 'recording', date: assignDate(new Date(2016, 0, 1)), ...source }
    })

    it('asks for the software and the instrument, and nothing its missing features would have to say', () => {
        expect(typesOf(recorded({}))).toEqual(['software-not-named', 'instrument-not-named'])
    })

    it('goes away once both are named', () => {
        const named = recorded({
            software: [{ name: 'Transkun', version: '2.0' }],
            instrument: { name: 'Steinway & Sons with Welte-Mignon Vorsetzer', sameAs: [] }
        })
        expect(typesOf(named)).toEqual([])
    })

    it('reports a copy nobody is known to hold', () => {
        const { keeper: _held, ...unheld } = recorded({})
        expect(typesOf(unheld)).toContain('keeper-unknown')
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
            date: assignDate(new Date(2015, 0, 1))
        }
        const stated = produce(edition(), stateSource('first', source))

        const reimported = await importJsonLd(JSON.parse(JSON.stringify(asJsonLd(stated))))

        expect(reimported.copies[0].readFrom).toEqual(source)
    })
})
