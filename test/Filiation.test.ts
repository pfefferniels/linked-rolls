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
import { sharedTexts } from '../src/filiation/texts'
import { PresenceMatrix } from '../src/filiation/presence'
import { siglaOf } from '../src/analysis/sigla'
import { snapshotOf } from '../src/analysis/text'
import { versionsWitnessedBy } from '../src/analysis/witnesses'
import { editsOf, insertedBy } from '../src/model/Version'
import { isCollationsOwn } from '../src/collation/Collation'
import { adoptEdits, proposeEdits } from '../src/filiation/edits'
import { stemmaRules } from '../src/filiation/record'
import { importJsonLd } from '../src/io/importJsonLd'
import { mm } from '../src/model/Quantity'
import { beliefIn, Inference, propositionSetOf } from '../src/model/Assumption'
import { linkedRolls } from '../src/software'

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

const punched = (id: string, items: readonly Item[], seed: number, missing: readonly number[] = []) => {
    const random = generator(seed)
    const features: AnyFeature[] = items.filter((_, index) => !missing.includes(index)).map((item, index) => {
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
        const lost = proposal.versions.filter(version => version.copies.length === 0)
        expect(lost).toHaveLength(2)
    })

    it('puts each reading where it arose, and its deletion where a branch struck it', () => {
        const proposal = proposeStemma(editionOfTradition())
        const byCopy = (copy: string) => proposal.versions.find(version => version.copies.includes(copy))!
        const c = proposal.versions.find(version => version.copies.length === 0 && version.parent !== undefined)!
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

describe('the record of an adopted stemma', () => {
    const run = { actor: { name: 'Editor', sameAs: [] }, date: { within: new Date(2026, 9, 12) } }
    const adoptedOf = (edition: Edition) => produce(edition, adoptStemma(proposeStemma(edition), run))

    it('is one proposition set every derivation the program states belongs to', () => {
        const adopted = adoptedOf(editionOfTradition())
        expect(adopted.propositionSets).toHaveLength(1)
        const [set] = adopted.propositionSets!
        const derivations = adopted.versions.flatMap(version => version.basedOn ?? [])
        expect(derivations).toHaveLength(5)
        expect(derivations.every(derivation => propositionSetOf(derivation) === set.id)).toBe(true)
        expect(derivations.every(derivation => beliefIn(adopted, derivation)?.certainty === 'likely')).toBe(true)
    })

    it('holds the edits the program made too, but none the editor wrote', () => {
        const edition = editionOfTradition()
        const adopted = adoptedOf(edition)
        const [set] = adopted.propositionSets!
        expect(adopted.versions.flatMap(editsOf).every(edit => propositionSetOf(edit) === set.id)).toBe(true)

        const d = versionsWitnessedBy(adopted, 'd').find(witness => !witness.through)!.version
        const motivated = produce(adopted, draft => {
            const version = draft.versions.find(version => version.id === d)!
            version.edits![0].motivation = 'accent'
            delete version.edits![0]['@annotation']
            version.motivations.push({ type: 'motivation', id: 'accent', note: 'An accent on the melody.' })
        })
        const again = produce(motivated, adoptStemma(proposeStemma(motivated), run))
        const kept = again.versions.find(version => version.id === d)!.edits![0]
        expect(kept.motivation).toBe('accent')
        expect(propositionSetOf(kept)).toBeUndefined()
    })

    it('rests on an inference this library drew, on the copies, by the rules its costs carry out', () => {
        const edition = editionOfTradition()
        const proposal = proposeStemma(edition)
        const [set] = produce(edition, adoptStemma(proposal, run)).propositionSets!
        const [reason] = set.belief.reasons as Inference[]
        expect(reason.type).toBe('inference')
        expect(reason.software).toEqual([linkedRolls])
        expect(reason.actor).toEqual(run.actor)
        expect(reason.date).toEqual(run.date)
        expect(reason.used).toEqual(proposal.copies)
        expect(reason.applies).toEqual(Object.values(stemmaRules))
        expect(reason.note).toContain(`The stemma ${proposal.notation}`)
        expect(reason.note).toContain('A reading arising costs 10')
    })

    it('names a rule only where a cost carries it out', () => {
        const edition = editionOfTradition()
        const proposal = proposeStemma(edition, { costs: { transferLoss: 1 } })
        const [reason] = produce(edition, adoptStemma(proposal)).propositionSets![0].belief.reasons as Inference[]
        expect(reason.applies).not.toContain(stemmaRules.recutLoss)
        expect(reason.applies).toContain(stemmaRules.sharedAddition)
        expect(reason.date).toBeUndefined()
        expect(reason.actor).toBeUndefined()
    })

    it('leaves a derivation the editor holds for reasons of their own outside the set', () => {
        const adopted = adoptedOf(editionOfTradition())
        const held = produce(adopted, draft => {
            const version = draft.versions.find(version => version.basedOn?.length)!
            version.basedOn![0]['@annotation'] = {
                id: 'own',
                belief: { type: 'belief', id: 'own-belief', certainty: 'true', reasons: [{ type: 'simpleArgumentation', note: 'Seen.' }] }
            }
        })
        const again = produce(held, adoptStemma(proposeStemma(held), run))
        const derivation = again.versions.find(version => version.basedOn?.[0]['@annotation']?.id === 'own')!.basedOn![0]
        expect(beliefIn(again, derivation)?.id).toBe('own-belief')
        expect(propositionSetOf(derivation)).toBeUndefined()
    })

    it('stays as it was first recorded when the very same run is adopted again', () => {
        const adopted = adoptedOf(editionOfTradition())
        const later = produce(adopted, adoptStemma(proposeStemma(adopted), { date: { within: new Date(2026, 10, 1) } }))
        expect(later.propositionSets).toEqual(adopted.propositionSets)
        expect(later).toEqual(adopted)
    })

    it('gives way to the record of another run, once nothing belongs to it any longer', () => {
        const adopted = adoptedOf(editionOfTradition())
        const otherwise = produce(adopted, adoptStemma(proposeStemma(adopted, { costs: { lostState: 5 } }), run))
        expect(otherwise.propositionSets).toHaveLength(1)
        expect(otherwise.propositionSets![0].id).not.toBe(adopted.propositionSets![0].id)
    })
})

describe('the edits of an adopted stemma', () => {
    it('are an edit for each accent a version adds, and one for each On it strikes', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, draft => {
            adoptStemma(proposeStemma(edition))(draft)
            adoptEdits()(draft)
        })
        const of = (copy: string) => adopted.versions.find(version =>
            version.id === versionsWitnessedBy(adopted, copy).find(witness => !witness.through)!.version)!
        expect(editsOf(of('b')).map(edit => edit.editType)).toEqual(Array(10).fill('additional-accent'))
        const e = editsOf(of('e'))
        expect(e.filter(edit => edit.editType === 'additional-accent')).toHaveLength(5)
        expect(e.filter(edit => edit.insert === undefined && edit.delete?.length === 1)).toHaveLength(3)
    })

    it('are recorded as a set of their own, which rests on the belief the stemma is held with', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, draft => {
            adoptStemma(proposeStemma(edition))(draft)
            adoptEdits()(draft)
        })
        const [stemma, edits] = adopted.propositionSets!
        expect(adopted.versions.flatMap(version => version.basedOn ?? []).every(derivation => propositionSetOf(derivation) === stemma.id)).toBe(true)
        const regrouped = adopted.versions.filter(version => version.basedOn).flatMap(editsOf)
        expect(regrouped.every(edit => propositionSetOf(edit) === edits.id)).toBe(true)
        const [reason] = edits.belief.reasons as Inference[]
        expect(reason.premises).toEqual([stemma.belief.id])
        expect(reason.software).toEqual([linkedRolls])
        expect(reason.applies).toEqual(['https://welte225.org/rules#one-place'])
    })

    it('are grouped again by a later proposal, typed as they are, as long as nobody has motivated them', () => {
        const edition = editionOfTradition()
        const adopted = produce(edition, draft => {
            adoptStemma(proposeStemma(edition))(draft)
            adoptEdits()(draft)
        })
        const b = adopted.versions.find(version => version.id === versionsWitnessedBy(adopted, 'b').find(witness => !witness.through)!.version)!
        // An accent's On and Off apart, as a proposal with a shorter reach for a pair leaves them.
        const apart = produce(adopted, adoptEdits([b.id], { pairWithin: mm(1) }))
        const regrouped = editsOf(apart.versions.find(version => version.id === b.id)!)
        expect(regrouped.length).toBe(20)
        // The edits of the other versions still belong to the first run's set, and b's to the second.
        const [, first, second] = apart.propositionSets!
        expect(first.id).toBe(adopted.propositionSets![1].id)
        expect(regrouped.every(edit => propositionSetOf(edit) === second.id)).toBe(true)
        // Once every version is regrouped so, nothing belongs to the first run's set any longer.
        const allApart = produce(apart, adoptEdits(undefined, { pairWithin: mm(1) }))
        expect(allApart.propositionSets!.map(set => set.id)).not.toContain(first.id)
    })
})

const exchangeOf = (inserted: readonly string[], deleted: readonly string[]) => [...inserted, ...deleted].sort().join()

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

    it('takes the stemma and its edits in as one operation', () => {
        const edition = published()
        const proposal = proposeStemma(edition)
        const adopted = produce(edition, draft => {
            adoptStemma(proposal)(draft)
            adoptEdits()(draft)
        })
        expect([...siglaOf(adopted).values()].sort()).toEqual([...siglaOf(edition).values()].sort())
        expect(adopted).toEqual(produce(produce(edition, adoptStemma(proposal)), adoptEdits()))
    })

    it('has nearly every edit the editor wrote proposed from what its version changes', () => {
        const edition = published()
        let written = 0
        let proposed = 0
        for (const version of edition.versions) {
            const exchanges = new Set(proposeEdits(edition, version.id).map(edit => exchangeOf(edit.insert, edit.delete)))
            for (const edit of editsOf(version).filter(edit => !isCollationsOwn(edit))) {
                written++
                if (exchanges.has(exchangeOf((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? []))) proposed++
            }
        }
        expect(written).toBe(414)
        expect(proposed / written).toBeGreaterThan(0.89)
    })

    it('types an edit as the editor did', () => {
        const edition = published()
        const disagreements = edition.versions.flatMap(version => {
            const proposed = new Map(proposeEdits(edition, version.id).map(edit => [exchangeOf(edit.insert, edit.delete), edit]))
            return editsOf(version).flatMap(edit => {
                const same = proposed.get(exchangeOf((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? []))
                return same && edit.editType && same.editType !== edit.editType ? [edit.editType] : []
            })
        })
        expect(disagreements).toEqual([])
    })

    it('has most of the editor\'s edits proposed from the copies alone', () => {
        const edition = published()
        const proposal = proposeStemma(edition, { pin: false })
        // As a collation leaves them: every change an edit of its own that nobody has read.
        const unread = produce(produce(edition, adoptStemma(proposal)), draft => {
            for (const version of draft.versions) {
                version.edits = [
                    ...insertedBy(version).map(symbol => ({ type: 'edit' as const, id: `i-${symbol.id}`, insert: [symbol] })),
                    ...editsOf(version).flatMap(edit => edit.delete ?? []).map(id => ({ type: 'edit' as const, id: `d-${id}`, delete: [id] }))
                ]
            }
        })
        const adopted = produce(unread, adoptEdits())
        const exchanges = new Set(adopted.versions.flatMap(version =>
            editsOf(version).map(edit => `${version.id}|${exchangeOf((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? [])}`)))
        const written = edition.versions.flatMap(version => editsOf(version).filter(edit => !isCollationsOwn(edit))
            .map(edit => `${version.id}|${exchangeOf((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? [])}`))
        expect(written.filter(edit => exchanges.has(edit)).length / written.length).toBeGreaterThan(0.75)
    })
})

describe('copies carrying the same text', () => {
    /** The tradition with further copies punched from the masters of d and f, one of them missing a hole. */
    const withPressings = (more: readonly [string, 'b' | 'd' | 'e' | 'f', number[]][]): Edition => {
        const texts = tradition()
        const seeds: Record<string, number> = { b: 1, d: 2, e: 3, f: 4 }
        const copies = (['b', 'd', 'e', 'f'] as const).map(id => punched(id, texts[id], seeds[id]))
        more.forEach(([id, of, missing], index) => copies.push(punched(id, texts[of], 10 + index, missing)))
        return editionOf(copies, [])
    }

    it('are one version, and what a copy lacks of it is a deviation of that copy', () => {
        const proposal = proposeStemma(withPressings([['d2', 'd', [7]], ['f2', 'f', []]]))
        expect(proposal.texts.map(text => text.copies)).toEqual([['b'], ['d', 'd2'], ['e'], ['f', 'f2']])
        expect(proposal.notation).toBe('*(b(*(d+d2,e)),f+f2)')
        const d = proposal.versions.find(version => version.copies.includes('d'))!
        expect(d.copies).toEqual(['d', 'd2'])
        expect(d.deviations.map(deviation => deviation.copy)).toEqual(['d2'])
    })

    it('let more than seven copies be searched, as long as they carry seven texts or fewer', () => {
        const proposal = proposeStemma(withPressings([
            ['b2', 'b', []], ['d2', 'd', []], ['d3', 'd', [3]], ['e2', 'e', []], ['f2', 'f', []]
        ]))
        expect(proposal.copies).toHaveLength(9)
        expect(proposal.texts).toHaveLength(4)
        expect(proposal.notation).toBe('*(b+b2(*(d+d2+d3,e+e2)),f+f2)')
    })

    it('stay apart where they differ in more readings than allowed', () => {
        const proposal = proposeStemma(withPressings([['d2', 'd', [7]]]), { sameText: 0 })
        expect(proposal.texts.map(text => text.copies)).toEqual([['b'], ['d'], ['e'], ['f'], ['d2']])
        expect(proposal.apart[0]).toEqual({ copies: ['d', 'd2'], differences: 1 })
    })

    it('stay together where the edition gives them one version', () => {
        const edition = withPressings([['d2', 'd', [7]]])
        const adopted = produce(edition, adoptStemma(proposeStemma(edition)))
        const one = (copy: string) => versionsWitnessedBy(adopted, copy).find(witness => witness.by === 'carriers' && !witness.through)?.version
        expect(one('d2')).toBe(one('d'))
        const again = proposeStemma(adopted, { sameText: -1 })
        expect(again.texts.find(text => text.copies.includes('d'))).toEqual({ copies: ['d', 'd2'], differences: 1, stated: true })
    })

    it('are of one system, and never chain copies far apart', () => {
        const matrix = (rows: string[]): PresenceMatrix => ({
            copies: ['a', 'b', 'c'],
            redundant: [],
            presence: Object.fromEntries(rows.map((row, index) => [`r${index}`, {
                a: row[0] === '1' ? 'present' : 'absent',
                b: row[1] === '1' ? 'present' : 'absent',
                c: row[2] === '1' ? 'present' : 'absent'
            }]))
        })
        // a and b differ in two readings, b and c in two, a and c in four
        const chain = matrix(['110', '110', '011', '011', '111'])
        expect(sharedTexts(chain, ['red', 'red', 'red'], 3).texts.map(text => text.copies)).toEqual([['a', 'b'], ['c']])
        const same = matrix(['111', '111'])
        expect(sharedTexts(same, ['red', 'red', 'green'], 3).texts.map(text => text.copies)).toEqual([['a', 'b'], ['c']])
    })
})
