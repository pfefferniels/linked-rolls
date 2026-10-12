import { describe, expect, it } from 'vitest'
import { freeze, produce } from 'immer'
import { copy, editionOf, hole, version } from './editionFixture'
import { Edition } from '../src/model/Edition'
import { Edit } from '../src/model/Edit'
import { AnySymbol, ExpressionScope } from '../src/model/Symbol'
import { assignReference } from '../src/model/Assumption'
import { HoleChain } from '../src/model/Feature'
import { TrackMeaning } from '../src/systems/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { unchecked } from '../src/collation/Collation'
import { adoptEdits, proposeEdits, ProposedEdit } from '../src/filiation/edits'

/** A symbol of the meaning, carried by a hole of its own where the bar reads it. */
const placed = (holes: HoleChain[]) => (id: string, meaning: TrackMeaning, from: number, to: number): AnySymbol => {
    holes.push(hole(`h-${id}`, from, to, welteT100.positionOf(meaning)!))
    const carriers = [assignReference(`h-${id}`)]
    return meaning.type === 'note'
        ? { type: 'note', id, pitch: meaning.pitch, carriers }
        : { type: 'expression', id, expressionType: meaning.expressionType, scope: meaning.scope, carriers }
}

const command = (expressionType: string, scope: ExpressionScope = 'treble'): TrackMeaning => ({ type: 'expression', expressionType, scope })
const pitch = (value: number): TrackMeaning => ({ type: 'note', pitch: value })

/**
 * A parent text and a version of it that changes it in every way an
 * editor of WM 225 did, each change an edit of its own, as a collation
 * leaves them.
 */
const changed = (): { edition: Edition, inserted: AnySymbol[], deleted: string[] } => {
    const holes: HoleChain[] = []
    const at = placed(holes)
    const base = [
        at('kept-note', pitch(70), 50, 900),
        at('moved-on', command('SlowCrescendoOn'), 200, 204),
        at('moved-off', command('SlowCrescendoOff'), 215, 219),
        at('alone-on', command('SlowCrescendoOn'), 300, 304),
        at('alone-off', command('SlowCrescendoOff'), 340, 344),
        at('long-note', pitch(60), 400, 450),
        at('struck-note', pitch(62), 500, 600)
    ]
    const inserted = [
        at('row-1', command('MezzoforteOff', 'bass'), 10, 13),
        at('row-2', command('SlowCrescendoOff', 'bass'), 10.5, 13),
        at('row-3', command('ForzandoOff'), 11, 14),
        at('row-4', command('SustainPedalOff'), 11.2, 14),
        at('accent-on', command('SlowCrescendoOn'), 100, 104),
        at('accent-off', command('SlowCrescendoOff'), 115, 119),
        at('put-on', command('SlowCrescendoOn'), 180, 184),
        at('put-off', command('SlowCrescendoOff'), 195, 199),
        at('later-on', command('SlowCrescendoOn'), 310, 314),
        at('shorter-note', pitch(60), 400, 430),
        at('first-stroke', pitch(62), 500, 550),
        at('second-stroke', pitch(62), 555, 600),
        at('idle-off', command('ForzandoOff', 'bass'), 700, 703)
    ]
    const deleted = ['moved-on', 'moved-off', 'alone-on', 'long-note', 'struck-note']
    const edition = editionOf([copy('x', holes)], [
        version('p', base.map(symbol => ({ type: 'edit', id: `e-${symbol.id}`, insert: [symbol] }))),
        version('c', [
            ...inserted.map((symbol): Edit => ({ type: 'edit', id: `e-${symbol.id}`, motivation: unchecked, insert: [symbol] })),
            ...deleted.map((id): Edit => ({ type: 'edit', id: `d-${id}`, motivation: unchecked, delete: [id] }))
        ], 'p')
    ])
    return { edition, inserted, deleted }
}

const exchanging = (edits: readonly ProposedEdit[], ...ids: string[]) =>
    edits.find(edit => [...edit.insert, ...edit.delete].sort().join() === [...ids].sort().join())

describe('the edits proposed for a version', () => {
    const { edition } = changed()
    const proposed = proposeEdits(edition, 'c')

    it('take an accent added for one edit', () => {
        expect(exchanging(proposed, 'accent-on', 'accent-off')).toMatchObject({ editType: 'additional-accent', grouping: 'pair' })
    })

    it('take an accent put elsewhere whole for one shift', () => {
        expect(exchanging(proposed, 'moved-on', 'moved-off', 'put-on', 'put-off')).toMatchObject({ editType: 'shift', grouping: 'move' })
    })

    it('take a command put elsewhere on its own for a shift', () => {
        expect(exchanging(proposed, 'alone-on', 'later-on')).toMatchObject({ editType: 'shift', grouping: 'move' })
    })

    it('take a note that ends earlier for a shortened one', () => {
        expect(exchanging(proposed, 'long-note', 'shorter-note')).toMatchObject({ editType: 'shorten', grouping: 'overlap' })
    })

    it('take a note struck again for one edit', () => {
        expect(exchanging(proposed, 'struck-note', 'first-stroke', 'second-stroke')).toMatchObject({ editType: 'shorten' })
    })

    it('take a command the text makes no use of for a redundancy', () => {
        expect(exchanging(proposed, 'idle-off')).toMatchObject({ editType: 'add-redundancy', grouping: 'single' })
    })

    it('take cancels punched across lines at one place for one row', () => {
        expect(exchanging(proposed, 'row-1', 'row-2', 'row-3', 'row-4')).toMatchObject({ grouping: 'row', editType: 'add-redundancy' })
    })

    it('account for every change once', () => {
        const ids = proposed.flatMap(edit => [...edit.insert, ...edit.delete])
        expect(ids).toHaveLength(new Set(ids).size)
        expect(ids).toHaveLength(13 + 5)
    })

    it('do not depend on how the version groups its changes now', () => {
        const { edition, inserted, deleted } = changed()
        const lumped = produce(edition, draft => {
            draft.versions[1].edits = [{ type: 'edit', id: 'all', insert: [...inserted].reverse(), delete: [...deleted].reverse() }]
        })
        expect(proposeEdits(lumped, 'c')).toEqual(proposed)
    })

    it('leave the text of a version that derives from none as it is', () => {
        expect(proposeEdits(edition, 'p').every(edit => edit.grouping === 'single' && edit.insert.length === 1)).toBe(true)
    })
})

describe('adopting the proposed edits', () => {
    it('puts them in place of what the collation wrote, unchecked', () => {
        const { edition } = changed()
        const adopted = produce(edition, adoptEdits())
        const edits = adopted.versions[1].edits!
        expect(edits).toHaveLength(proposeEdits(edition, 'c').length)
        expect(edits.every(edit => edit.motivation === unchecked)).toBe(true)
        expect(adopted.versions[0]).toEqual(edition.versions[0])
    })

    it('keeps an edit somebody motivated, and states what it leaves of a proposed one symbol by symbol', () => {
        const { edition } = changed()
        const motivated = produce(edition, draft => {
            const edit = draft.versions[1].edits!.find(edit => edit.id === 'e-accent-on')!
            edit.motivation = 'melody'
            draft.versions[1].motivations.push({ type: 'motivation', id: 'melody', note: 'The melody brought out.' })
        })
        const edits = produce(motivated, adoptEdits()).versions[1].edits!
        expect(edits).toContainEqual(motivated.versions[1].edits!.find(edit => edit.id === 'e-accent-on'))
        expect(edits.find(edit => edit.insert?.some(symbol => symbol.id === 'accent-off'))?.insert).toHaveLength(1)
    })

    it('changes nothing when adopted again', () => {
        const { edition } = changed()
        const once = produce(edition, adoptEdits())
        expect(produce(once, adoptEdits())).toEqual(once)
    })

    it('writes a version that an operation before put on the same draft', () => {
        const { edition } = changed()
        const frozen = freeze(structuredClone(edition), true)
        const adopted = produce(frozen, draft => {
            draft.versions = [...frozen.versions]
            adoptEdits()(draft)
        })
        expect(adopted).toEqual(produce(edition, adoptEdits()))
    })

    it('gives the same ids when the collation is adopted again', () => {
        const { edition } = changed()
        expect(produce(edition, adoptEdits())).toEqual(produce(edition, adoptEdits()))
    })
})
