import { Edition } from '../src/Edition'
import { Hole } from '../src/Feature'
import { RollCopy } from '../src/RollCopy'
import { Expression, Note, Text } from '../src/Symbol'
import { Version } from '../src/Version'
import { assignReference, assignValue } from '../src/Assumption'
import { mm, track } from '../src/Quantity'

export const hole = (id: string, from: number, to: number, position: number): Hole => ({
    type: 'Hole',
    id,
    horizontal: { unit: 'mm', from: mm(from), to: mm(to) },
    vertical: { unit: 'track', from: track(position) }
})

export const copy = (id: string, features: Hole[]): RollCopy => ({
    type: 'RollCopy',
    id,
    ops: [],
    measurements: {},
    conditions: [],
    modifications: [],
    keeper: { name: id, sameAs: [] },
    features
})

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
    type: 'Version',
    id,
    siglum: id,
    versionType: 'edition',
    edits,
    motivations: [],
    ...(basedOn ? { basedOn: assignReference(basedOn) } : {})
})

const nobody = { name: '', sameAs: [] }

export const editionOf = (copies: RollCopy[], versions: Version[]): Edition => ({
    base: '',
    title: '',
    license: '',
    creation: { publisher: nobody, publicationDate: new Date() },
    roll: {
        catalogueNumber: '',
        system: nobody,
        recordingEvent: { recorded: { pianist: nobody, playing: '' }, place: nobody, date: assignValue(new Date()) }
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
