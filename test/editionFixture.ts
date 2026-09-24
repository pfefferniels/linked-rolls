import { Edition } from '../src/model/Edition'
import { AnyFeature, Patch, HoleChain } from '../src/model/Feature'
import { Modification, RollCopy } from '../src/model/RollCopy'
import { Concept } from '../src/model/Agent'
import { Expression, Note, Text } from '../src/model/Symbol'
import { Version } from '../src/model/Version'
import { assignDate, assignReference } from '../src/model/Assumption'
import { mm, track } from '../src/model/Quantity'
import { systemOf } from '../src/systems/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'

export const hole = (id: string, from: number, to: number, position: number): HoleChain => ({
    type: 'HoleChain',
    id,
    horizontal: { unit: 'mm', from: mm(from), to: mm(to) },
    vertical: { unit: 'track', from: track(position) }
})

/** A copy whose features are those its punching produced, which is where a reading puts them. */
export const copy = (id: string, produced: AnyFeature[]): RollCopy => ({
    type: 'RollCopy',
    id,
    measurements: {},
    conditions: [],
    modifications: [],
    keeper: { name: id, sameAs: [] },
    production: { system: systemOf(welteT100), produced }
})

/** The copy as cut for another system, the features its punching produced staying where they are. */
export const cutFor = (copy: RollCopy, system: Concept | undefined): RollCopy =>
    ({ ...copy, production: { ...copy.production, system } })

/** An act gluing the patches onto a copy. */
export const attachment = (...added: Patch[]): Modification =>
    ({ type: 'Attachment', purpose: 'labeling', added })

/** An act bringing features about on a copy: a writing, a mark, a hole punched by hand. */
export const alteration = (...produced: AnyFeature[]): Modification =>
    ({ type: 'Alteration', purpose: 'glossing', produced })

export const note = (id: string, pitch: number, ...carriers: string[]): Note => ({
    type: 'note',
    id,
    pitch,
    carriers: carriers.map(assignReference)
})

export const expression = (id: string, expressionType: string, ...carriers: string[]): Expression => ({
    type: 'expression',
    id,
    expressionType,
    scope: 'treble',
    carriers: carriers.map(assignReference)
})

export const label = (id: string, text: string): Text => ({ type: 'text', id, text, carriers: [] })

export const version = (id: string, edits: Version['edits'], basedOn?: string): Version => ({
    id,
    system: systemOf(welteT100),
    edits,
    motivations: [],
    ...(basedOn ? { basedOn: [assignReference(basedOn)] } : {})
})

const nobody = { name: '', sameAs: [] }

export const editionOf = (copies: RollCopy[], versions: Version[]): Edition => ({
    base: '',
    title: '',
    license: '',
    creation: { publisher: nobody, publicationDate: new Date() },
    roll: {
        catalogueNumber: '',
        recordingEvent: { recorded: { pianist: nobody, playing: '' }, place: nobody, date: assignDate(new Date()) }
    },
    copies,
    versions
})

/**
 * A roll in two copies and two versions. Both copies carry the note,
 * the first alone carries a second note and a forzando on and off,
 * and the note is placed against the second note and paired with the
 * forzando on. Version B takes the forzando on away. A label stands
 * on no copy at all.
 */
export const edition = (): Edition => editionOf(
    [
        copy('first', [
            hole('hole-note', 1000, 1010, 47),
            hole('hole-other-note', 1020, 1030, 49),
            hole('hole-off', 1004, 1006, 96),
            hole('hole-on', 990, 992, 95)
        ]),
        copy('second', [hole('hole-note-second', 1001, 1011, 47)])
    ],
    [
        version('A', [{
            type: 'edit',
            id: 'edit-a',
            insert: [
                {
                    ...note('note', 60, 'hole-note', 'hole-note-second'),
                    alignedWith: assignReference('other-note'),
                    pairedWith: assignReference('forzando-on')
                },
                note('other-note', 62, 'hole-other-note'),
                expression('forzando-off', 'ForzandoOff', 'hole-off'),
                expression('forzando-on', 'ForzandoOn', 'hole-on'),
                label('label', 'WM 225')
            ]
        }]),
        version('B', [{ type: 'edit', id: 'edit-b', delete: ['forzando-on'] }], 'A')
    ]
)
