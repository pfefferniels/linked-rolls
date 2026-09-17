import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { Edition } from '../src/Edition'
import { EditionView } from '../src/EditionView'
import { GluedOn, Mark, NestedFeature, Transcription, Writing, withBorneFeatures } from '../src/Feature'
import { featuresOf, isModification, Modification } from '../src/RollCopy'
import { assignObject } from '../src/Assumption'
import { addBorneFeature, addFeature } from '../src/editionOps'
import { mm, track } from '../src/Quantity'
import { alteration, attachment, copy, editionOf, hole, note, version } from './editionFixture'

const at = (from: number, to: number) => ({
    horizontal: { unit: 'mm' as const, from: mm(from), to: mm(to) },
    vertical: { unit: 'track' as const, from: track(47) }
})

const mark = (id: string): Mark => ({ type: 'Mark', id, ...at(80, 90), medium: 'pencil' })

const writing = (id: string, text: string): Writing => ({
    type: 'Writing',
    id,
    ...at(20, 60),
    technique: 'handwriting',
    transcription: assignObject<Transcription>({ type: 'text', id: `${id}-text`, text })
})

const borne = (id: string): NestedFeature => ({
    type: 'Writing',
    id,
    technique: 'print',
    transcription: assignObject<Transcription>({ type: 'text', id: `${id}-text`, text: 'Welte' })
})

const patch = (id: string): GluedOn => ({ type: 'GluedOn', id, ...at(100, 140), material: 'paper' })

/** A copy with a punched hole and a dating act that wrote one date on it. */
const dated = (): Edition => editionOf(
    [{ ...copy('first', [hole('perforation', 10, 12, 47)]), modifications: [alteration(writing('date', '1905'))] }],
    [version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'perforation')] }])]
)

const acts = (edition: Edition): Modification[] => edition.copies[0].modifications

const producedIn = (edition: Edition) => acts(edition).map(act =>
    act.type === 'Alteration' ? act.produced.map(feature => feature.id)
        : act.type === 'Attachment' ? act.added.map(feature => feature.id) : [])

const punchedIn = (edition: Edition) => (edition.copies[0].production?.produced ?? []).map(feature => feature.id)

describe('stating a feature the copy bears', () => {
    it('puts it in an act of its own, which is what a later hand is', () => {
        const next = produce(dated(), addFeature('first', mark('circle'), { purpose: 'glossing' }))

        expect(producedIn(next)).toEqual([['date'], ['circle']])
        expect(acts(next)[1]).toMatchObject({ type: 'Alteration', purpose: 'glossing' })
        expect(punchedIn(next)).toEqual(['perforation'])
    })

    it('puts it among the punched features where the punching made it', () => {
        const next = produce(dated(), addFeature('first', hole('missed', 20, 22, 48), { punched: true }))

        expect(punchedIn(next)).toEqual(['perforation', 'missed'])
        expect(producedIn(next)).toEqual([['date']])
    })

    it('puts it in the act that brought another feature about', () => {
        const next = produce(dated(), addFeature('first', writing('initials', 'F.'), { beside: 'date' }))

        expect(producedIn(next)).toEqual([['date', 'initials']])
        expect(punchedIn(next)).toEqual(['perforation'])
    })

    it('reaches the punching through a feature it produced', () => {
        const next = produce(dated(), addFeature('first', hole('missed', 20, 22, 48), { beside: 'perforation' }))

        expect(punchedIn(next)).toEqual(['perforation', 'missed'])
        expect(producedIn(next)).toEqual([['date']])
    })

    it('glues a patch on rather than producing it, whatever the act says', () => {
        const next = produce(dated(), addFeature('first', patch('label'), { punched: true, purpose: 'labeling' }))

        expect(acts(next)[1]).toMatchObject({ type: 'Attachment', purpose: 'labeling' })
        expect(producedIn(next)).toEqual([['date'], ['label']])
        expect(punchedIn(next)).toEqual(['perforation'])
    })

    it('puts a patch in the attachment that glued another on', () => {
        const before = produce(dated(), draft => {
            draft.copies[0].modifications.push(attachment(patch('tape')))
        })
        const next = produce(before, addFeature('first', patch('tape-too'), { beside: 'tape' }))

        expect(producedIn(next)).toEqual([['date'], ['tape', 'tape-too']])
    })

    it('makes an act of its own where the feature it should stand beside is not there', () => {
        const next = produce(dated(), addFeature('first', mark('circle'), { beside: 'nowhere' }))

        expect(producedIn(next)).toEqual([['date'], ['circle']])
    })

    it('leaves the edition as it is for a copy it does not have', () => {
        const before = dated()
        expect(produce(before, addFeature('nothing', mark('circle')))).toBe(before)
    })
})

describe('stating a feature a patch bears', () => {
    const labelled = () => produce(dated(), draft => {
        draft.copies[0].modifications.push(attachment(patch('label')))
    })

    it('puts it on the patch, where it states no place of its own', () => {
        const next = produce(labelled(), addBorneFeature('first', 'label', borne('title')))
        const found = featuresOf(next.copies[0]).flatMap(withBorneFeatures).map(feature => feature.id)

        expect(found).toEqual(['perforation', 'date', 'label', 'title'])
        expect(producedIn(next)).toEqual([['date'], ['label']])
    })

    it('leaves the edition as it is where the id names no patch', () => {
        const before = labelled()
        expect(produce(before, addBorneFeature('first', 'date', borne('title')))).toBe(before)
        expect(produce(before, addBorneFeature('first', 'nowhere', borne('title')))).toBe(before)
    })
})

describe('the act a feature stands in', () => {
    it('is the production for a punched feature and the modification for a later one', () => {
        const edition = dated()
        const view = new EditionView(edition)

        expect(view.actOf('perforation')).toBe(edition.copies[0].production)
        expect(view.actOf('date')).toBe(edition.copies[0].modifications[0])
        expect(isModification(view.actOf('date')!)).toBe(true)
        expect(isModification(view.actOf('perforation')!)).toBe(false)
    })

    it('is the attachment that glued the patch on, for what the patch bears', () => {
        const edition = produce(
            produce(dated(), draft => { draft.copies[0].modifications.push(attachment(patch('label'))) }),
            addBorneFeature('first', 'label', borne('title')))
        const view = new EditionView(edition)

        expect(view.actOf('title')).toBe(edition.copies[0].modifications[1])
        expect(view.actOf('title')).toBe(view.actOf('label'))
    })

    it('says nothing of an id no copy bears', () => {
        expect(new EditionView(dated()).actOf('nowhere')).toBeUndefined()
    })

    it('tells two features of one act from two of different acts', () => {
        const view = new EditionView(dated())
        expect(view.actOf('date')).not.toBe(view.actOf('perforation'))
    })
})
