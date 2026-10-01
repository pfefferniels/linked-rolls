import { describe, expect, it } from 'vitest'
import { paperSeconds, paperSpeed, Spool, WELTE_SPOOL } from 'welte-mignon-emulator'
import { Edition } from '../src/model/Edition'
import { PaperSpeed, RollCopy } from '../src/model/RollCopy'
import { Certainty } from '../src/model/Assumption'
import { lengthRatioOf, paperSpeedOf } from '../src/analysis/paper'
import { toOwnPaperOf } from '../src/analysis/ownPaper'
import { emulate } from '../src/emulation/Emulation'
import { feetPerMinute, metersPerMinute, mm, track } from '../src/model/Quantity'
import { systemOf } from '../src/systems/TrackerBar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { spoolFor, startingSpeedOf } from '../src/systems/welte'
import { welteT100System } from '../src/systems/welteT100/system'
import { welteLicenseeSystem } from '../src/systems/welteLicensee/system'
import { versionIn } from '../src/lookup/lookup'
import { copy, cutFor, editionOf, hole, note, version } from './editionFixture'

/**
 * A version runs at the speed its copies state they were cut for, taken as
 * the speed at the beginning of the roll. Where none is stated, a system runs
 * on its own spool, and the Licensee, which has none, times a re-cut by the
 * roll it was re-cut from and the length ratio.
 */

/** A copy with one hole, aligned onto the axis by the scale given, against the reference copy. */
const aligned = (id: string, scale: number): RollCopy => ({
    ...copy(id, [hole(`${id}-hole`, 1000, 1010, 47)]),
    measurements: {
        alignment: { against: 'St1', shift: { horizontal: mm(0), vertical: track(0) }, scale, scaleError: scale * 2e-5 }
    }
})

/** The copy stating the speed it was cut for, held as certain as given. */
const stating = (copy: RollCopy, speed: PaperSpeed, certainty: Certainty = 'likely'): RollCopy => ({
    ...copy,
    production: {
        ...copy.production,
        speed: {
            ...speed,
            '@annotation': { id: `${copy.id}-speed`, belief: { type: 'belief', id: `${copy.id}-belief`, certainty, reasons: [] } }
        }
    }
})

const licensee = (copy: RollCopy): RollCopy => cutFor(copy, systemOf(welteLicensee))

const threeMetres: PaperSpeed = { value: metersPerMinute(3), unit: 'm/min' }
const tempo83: PaperSpeed = { value: feetPerMinute(8.3), unit: 'ft/min' }

/**
 * The red copies of Welte 225 carrying version A, a red version B derived
 * from it that no copy carries, the Licensee copy Ch1 carrying L, re-cut from
 * A, and a second Licensee re-cut M, from A as well, whose one copy measures
 * no paper. St1 and Ch1 state what the caller gives them.
 */
const welte225 = ({ st1, ch1 }: { st1?: PaperSpeed, ch1?: PaperSpeed } = {}): Edition => ({
    ...editionOf([
        st1 ? stating(copy('St1', [hole('St1-hole', 1000, 1010, 47)]), st1) : copy('St1', [hole('St1-hole', 1000, 1010, 47)]),
        aligned('St2', 0.9978034872721986),
        aligned('Wi1', 1.0016647616495822),
        licensee(ch1 ? stating(aligned('Ch1', 1.3011593658380265), ch1) : aligned('Ch1', 1.3011593658380265)),
        licensee(copy('Ne1', [hole('Ne1-hole', 1000, 1010, 47)]))
    ], [
        version('A', [{ type: 'edit', id: 'edit-a', insert: [note('red', 60, 'St1-hole', 'St2-hole', 'Wi1-hole')] }]),
        version('B', [], 'A'),
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

/** The red spool turned to start the paper at the speed, in metres a minute. */
const redStartingAt = (speed: number): Spool =>
    ({ ...WELTE_SPOOL, revolutionSeconds: WELTE_SPOOL.circumferenceCm / (speed * 100 / 60) })

const startsAt = (spool: Spool): number => paperSpeed(spool, 0) * 60 / 100

describe('paperSpeedOf', () => {
    it('is the speed the copies of the version\'s own system state, in metres a minute', () => {
        expect(paperSpeedOf(welte225({ st1: threeMetres }), 'A')).toBeCloseTo(3, 9)
        expect(paperSpeedOf(welte225({ ch1: tempo83 }), 'L')).toBeCloseTo(8.3 * 0.3048, 9)
    })

    it('takes nothing from a copy of another system, nor from a speed held only possible', () => {
        expect(paperSpeedOf(welte225({ ch1: tempo83 }), 'A')).toBeUndefined()
        const doubted = welte225()
        doubted.copies[0] = stating(doubted.copies[0], threeMetres, 'possible')
        expect(paperSpeedOf(doubted, 'A')).toBeUndefined()
    })

    it('is nothing where no copy states one', () => {
        expect(paperSpeedOf(welte225(), 'A')).toBeUndefined()
        expect(paperSpeedOf(welte225(), 'L')).toBeUndefined()
    })
})

describe('spoolFor', () => {
    it('starts at a stated speed on any system, keeping the spool\'s geometry', () => {
        for (const own of [true, false]) {
            const spool = spoolFor(WELTE_SPOOL, { paperSpeed: metersPerMinute(2.5), recutFrom: { lengthRatio: 0.77 } }, own)
            expect(startsAt(spool)).toBeCloseTo(2.5, 9)
            expect(spool.circumferenceCm).toBe(WELTE_SPOOL.circumferenceCm)
            expect(spool.layerCm).toBe(WELTE_SPOOL.layerCm)
        }
    })

    it('runs a system\'s own spool as it stands where no speed is stated, re-cut or not', () => {
        expect(spoolFor(WELTE_SPOOL, { recutFrom: { lengthRatio: 0.77 } }, true)).toBe(WELTE_SPOOL)
        expect(spoolFor(WELTE_SPOOL, {}, true)).toBe(WELTE_SPOOL)
    })

    it('times a re-cut on a borrowed spool by its original, shortened by the length ratio', () => {
        expect(startsAt(spoolFor(WELTE_SPOOL, { recutFrom: { lengthRatio: 0.77 } }, false)))
            .toBeCloseTo(0.77 * startingSpeedOf(WELTE_SPOOL), 9)
        expect(startsAt(spoolFor(WELTE_SPOOL, { recutFrom: { lengthRatio: 0.77, paperSpeed: metersPerMinute(3) } }, false)))
            .toBeCloseTo(0.77 * 3, 9)
    })

    it('leaves a borrowed spool as it stands for a version that is no re-cut', () => {
        expect(spoolFor(WELTE_SPOOL, {}, false)).toBe(WELTE_SPOOL)
    })
})

describe('a version, performed', () => {
    /** When the note sounds, and where the edition places it. */
    const onsetOf = (edition: Edition, versionId: string, noteId: string) => {
        const system = ['L', 'M'].includes(versionId) ? welteLicenseeSystem : welteT100System
        const performed = emulate(system, versionIn(edition, versionId)!, edition)
        const onset = performed.events.find(event => event.type === 'noteOn' && event.performs.id === noteId)!
        return { at: onset.at, place: onset.performs.horizontal.from }
    }

    /** When the spool brings the place to the bar, on the version's own paper. */
    const secondsOn = (spool: Spool, edition: Edition, versionId: string, place: number) =>
        paperSeconds(spool, place * toOwnPaperOf(edition, versionIn(edition, versionId)!)! / 10)

    it('sounds a Licensee re-cut at the tempo of its original where its copies state no speed', () => {
        const edition = welte225()
        const { at, place } = onsetOf(edition, 'L', 'recut')
        // The red roll would bring the same place of the axis to the bar at nearly the same moment.
        expect(at / paperSeconds(WELTE_SPOOL, place / 10)).toBeCloseTo(1, 2)
    })

    it('times a second re-cut by the paper its system has, though its own copy measures none', () => {
        const edition = welte225()
        expect(lengthRatioOf(edition, 'M')).toBeUndefined()
        const { at, place } = onsetOf(edition, 'M', 'other-recut')
        expect(at / paperSeconds(WELTE_SPOOL, place / 10)).toBeCloseTo(1, 2)
    })

    it('times a Licensee re-cut by the speed its original\'s copies state', () => {
        const edition = welte225({ st1: threeMetres })
        const { at, place } = onsetOf(edition, 'L', 'recut')
        const ratio = lengthRatioOf(edition, 'L')!.value
        expect(at).toBeCloseTo(secondsOn(redStartingAt(3 * ratio), edition, 'L', place), 6)
    })

    it('starts a version at the speed its own copies state', () => {
        const licensee = welte225({ ch1: tempo83 })
        const recut = onsetOf(licensee, 'L', 'recut')
        expect(recut.at).toBeCloseTo(secondsOn(redStartingAt(8.3 * 0.3048), licensee, 'L', recut.place), 6)

        const red = welte225({ st1: threeMetres })
        const original = onsetOf(red, 'A', 'red')
        expect(original.at).toBeCloseTo(secondsOn(redStartingAt(3), red, 'A', original.place), 6)
    })

    it('keeps the speed stated for the version it derives from on the same system', () => {
        const edition = welte225({ st1: threeMetres })
        const { at, place } = onsetOf(edition, 'B', 'red')
        expect(at).toBeCloseTo(secondsOn(redStartingAt(3), edition, 'B', place), 6)
    })

    it('leaves a red version on its own spool where nothing is stated', () => {
        const edition = welte225()
        const { at, place } = onsetOf(edition, 'A', 'red')
        expect(at).toBeCloseTo(secondsOn(WELTE_SPOOL, edition, 'A', place), 6)
    })
})
