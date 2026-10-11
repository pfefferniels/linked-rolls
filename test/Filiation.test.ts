import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { produce } from 'immer'
import { editionOf, copy, hole } from './editionFixture'
import { generator } from './pieceFixture'
import { Edition } from '../src/model/Edition'
import { AnyFeature } from '../src/model/Feature'
import { TrackMeaning } from '../src/systems/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { proposeStemma } from '../src/filiation/proposal'
import { adoptStemma, adoptionOf } from '../src/filiation/adoption'
import { stemmaChanges } from '../src/filiation/changes'
import { collateCopies } from '../src/filiation/readings'
import { ineffectiveAmong } from '../src/filiation/presence'
import { stemmataOf } from '../src/filiation/trees'
import { siglaOf } from '../src/analysis/sigla'
import { snapshotOf } from '../src/analysis/text'
import { versionsWitnessedBy } from '../src/analysis/witnesses'
import { insertedBy } from '../src/model/Version'
import { importJsonLd } from '../src/io/importJsonLd'

/** A reading of the text: what it says and where it begins. */
type Item = { meaning: TrackMeaning, at: number, length: number }

const noteAt = (pitch: number, at: number): Item => ({ meaning: { type: 'note', pitch }, at, length: 12 })
const commandAt = (expressionType: string, at: number): Item =>
    ({ meaning: { type: 'expression', expressionType, scope: 'treble' }, at, length: 2 })

/** An accent: the crescendo turned on just before a note and off just after it. */
const accentAt = (at: number): Item[] => [commandAt('SlowCrescendoOn', at - 6), commandAt('SlowCrescendoOff', at + 3)]

/**
 * A tradition of known descent. The mother text a is lost; f derives
 * from it, and so does b, from which the lost c derives, and from c both
 * d and e. Copies carry b, d, e and f, each punched a little off the
 * place of its version, as copies are.
 */
const tradition = () => {
    const random = generator(7)
    const base: Item[] = []
    for (let at = 200; at < 6000; at += 40) base.push(noteAt(48 + Math.floor(random() * 30), at))
    const accents = (from: number, count: number) =>
        Array.from({ length: count }, (_, i) => accentAt(from + i * 160 + 20)).flat()
    const b = [...base, ...accents(200, 10)]
    const c = [...b, ...accents(1820, 8)]
    const d = [...c, ...accents(3100, 6)]
    // e withdraws three of b's accents by striking their On and keeping their Off
    const struck = new Set(accentAt(220).concat(accentAt(380), accentAt(540)).filter(item => item.meaning.type === 'expression'
        && item.meaning.expressionType === 'SlowCrescendoOn').map(item => item.at))
    const e = [...c.filter(item => !(item.meaning.type === 'expression' && item.meaning.expressionType === 'SlowCrescendoOn' && struck.has(item.at))), ...accents(4100, 5)]
    const f = [...base, ...accents(5000, 4)]
    return { b, d, e, f }
}

const punched = (id: string, items: readonly Item[], seed: number) => {
    const random = generator(seed)
    const features: AnyFeature[] = items.map((item, index) => {
        const jitter = (random() - 0.5) * 0.6
        return hole(`${id}-${index}`, item.at + jitter, item.at + item.length + jitter, welteT100.positionOf(item.meaning)!)
    })
    return copy(id, features)
}

const editionOfTradition = (order: readonly string[] = ['b', 'd', 'e', 'f']): Edition => {
    const texts = tradition()
    const seeds: Record<string, number> = { b: 1, d: 2, e: 3, f: 4 }
    return editionOf(order.map(id => punched(id, texts[id as keyof typeof texts], seeds[id])), [])
}

describe('the stemmata of a set of copies', () => {
    it('are every rooted tree with copies at any node and lost states above two or more, each once', () => {
        const counts = [2, 3, 4, 5, 6].map(n => {
            let count = 0
            for (const tree of stemmataOf(n)) {
                expect(tree).toBeDefined()
                count++
            }
            return count
        })
        expect(counts).toEqual([3, 22, 262, 4336, 91984])
    })
})

describe('the collation of copies', () => {
    it('does not depend on the order the copies are given in', () => {
        const one = collateCopies(editionOfTradition(), ['b', 'd', 'e', 'f'])
        const other = collateCopies(editionOfTradition(['f', 'e', 'd', 'b']), ['f', 'e', 'd', 'b'])
        expect(other.readings.map(reading => reading.id).sort()).toEqual(one.readings.map(reading => reading.id).sort())
    })

    it('joins what the copies punched at one place into one reading', () => {
        const collation = collateCopies(editionOfTradition(), ['b', 'd', 'e', 'f'])
        const base = collation.readings.filter(reading => reading.meaning.type === 'note')
        expect(base.every(reading => reading.copies.length === 4)).toBe(true)
    })
})

describe('the ineffective commands of a text', () => {
    it('are those that set what is set, or cancel what is cancelled', () => {
        const at = (id: string, expressionType: string, from: number) =>
            ({ id, meaning: { type: 'expression', expressionType, scope: 'treble' } as TrackMeaning, place: { unit: 'mm' as const, from, to: from + 2 } })
        const ineffective = ineffectiveAmong(welteT100, [
            at('on', 'SlowCrescendoOn', 10),
            at('again', 'SlowCrescendoOn', 20),
            at('off', 'SlowCrescendoOff', 30),
            at('orphan', 'SlowCrescendoOff', 40)
        ])
        expect([...ineffective].sort()).toEqual(['again', 'orphan'])
    })
})

describe('a stemma proposed from the copies', () => {
    it('finds the descent the copies were punched from, lost states included', () => {
        const proposal = proposeStemma(editionOfTradition())
        expect(proposal.notation).toBe('*(b(*(d,e)),f)')
        const lost = proposal.versions.filter(version => version.copy === undefined)
        expect(lost).toHaveLength(2)
    })

    it('puts each reading where it arose, and its deletion where a branch struck it', () => {
        const proposal = proposeStemma(editionOfTradition())
        const byCopy = (copy: string) => proposal.versions.find(version => version.copy === copy)!
        const c = proposal.versions.find(version => version.copy === undefined && version.parent !== undefined)!
        expect(byCopy('b').inserts).toHaveLength(20)
        expect(c.inserts).toHaveLength(16)
        expect(byCopy('d').inserts).toHaveLength(12)
        expect(byCopy('e').inserts).toHaveLength(10)
        expect(byCopy('e').deletes).toHaveLength(3)
        expect(byCopy('f').inserts).toHaveLength(8)
        expect(proposal.conflicts).toEqual([])
    })

    it('is the same whatever order the edition lists its copies in', () => {
        const one = proposeStemma(editionOfTradition())
        const other = proposeStemma(editionOfTradition(['f', 'e', 'd', 'b']))
        expect(other.notation).toBe(one.notation)
        expect(other.cost).toBeCloseTo(one.cost)
    })

    it('reports how firmly the copies decide each grouping', () => {
        const proposal = proposeStemma(editionOfTradition())
        const grouping = proposal.supports.find(support => !support.ancestor && support.copies.join() === 'd,e')
        expect(grouping?.margin).toBeGreaterThan(0)
    })
})

describe('adopting a proposed stemma', () => {
    it('gives every copy a version whose text is what the copy carries', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, adoptStemma(proposeStemma(edition)))
        expect(adopted.versions).toHaveLength(6)
        for (const copy of adopted.copies) {
            const firstHand = versionsWitnessedBy(adopted, copy.id).find(witness => witness.by === 'carriers' && !witness.through)
            expect(firstHand).toBeDefined()
            expect(snapshotOf(adopted, firstHand!.version)).toHaveLength(copy.production!.produced!.length)
        }
        expect(new Set(siglaOf(adopted).values()).size).toBe(6)
    })

    it('changes nothing when the copies are proposed for again', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, adoptStemma(proposeStemma(edition)))
        const again = produce(adopted, adoptStemma(proposeStemma(adopted)))
        const changed = stemmaChanges(adopted, again).filter(change =>
            change.parentBefore !== change.parentAfter
            || change.inserted.gone.length + change.inserted.added.length + change.deleted.gone.length + change.deleted.added.length > 0)
        expect(changed).toEqual([])
    })

    it('keeps an edit the editor wrote, with what was written on it', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, adoptStemma(proposeStemma(edition)))
        const d = versionsWitnessedBy(adopted, 'd').find(witness => !witness.through)!.version
        const motivated = produce(adopted, draft => {
            const version = draft.versions.find(version => version.id === d)!
            version.edits![0].motivation = 'accent'
            version.motivations.push({ type: 'motivation', id: 'accent', note: 'An accent on the melody.' })
        })
        const proposal = proposeStemma(motivated)
        const edit = motivated.versions.find(version => version.id === d)!.edits![0]
        expect(proposal.versions.find(version => version.version === d)!.pinned).toContain(edit.id)
        const again = produce(motivated, adoptStemma(proposal))
        expect(again.versions.find(version => version.id === d)!.edits).toContainEqual(edit)
    })

    it('leaves the edition as it was, until applied', () => {
        const edition = editionOfTradition()
        const adoption = adoptionOf(edition, proposeStemma(edition))
        expect(adoption.versions).toHaveLength(6)
        expect(edition.versions).toHaveLength(0)
    })
})

/** The published edition of WM 225 in a checkout beside this one, where there is one. */
const welte225 = process.env.WELTE225_EDITION ?? new URL('../../welte225.org/edition.jsonld', import.meta.url).pathname

describe.skipIf(!existsSync(welte225))('the stemma of WM 225, proposed from its six transcribed copies', () => {
    // Read in the tests, since a skipped suite still runs its body.
    let read: Edition | undefined
    const published = () => read ??= importJsonLd(JSON.parse(readFileSync(welte225, 'utf8')))

    it('is the editor’s, every version standing for one of the edition', () => {
        const proposal = proposeStemma(published())
        expect(proposal.notation).toBe('*(St1(*(Ne1,St2(Bo1,Ch1))),Wi1)')
        expect(proposal.versions.every(version => version.version !== undefined)).toBe(true)
    })

    it('keeps the sigla when adopted, and nearly every reading in its version', () => {
        const edition = published()
        const adopted = produce(edition, adoptStemma(proposeStemma(edition)))
        expect([...siglaOf(adopted).values()].sort()).toEqual([...siglaOf(edition).values()].sort())
        const changes = stemmaChanges(edition, adopted)
        const kept = changes.reduce((sum, change) => sum + change.inserted.kept, 0)
        const before = edition.versions.reduce((sum, version) => sum + insertedBy(version).length, 0)
        expect(kept / before).toBeGreaterThan(0.95)
    })
})
