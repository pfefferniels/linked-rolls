/**
 * A note refers to an entity instead of naming it, so that a label the
 * stemma decides is never written into the prose. A reference reads
 * `{{<id>}}`, where the id is the entity's, and is resolved when the note
 * is shown.
 *
 * An entity the edition gives no name to, a command or an edit, needs
 * the note's own words to stand in the sentence: `{{<id>|die Stanzung bei
 * 7364,7 mm}}`. The name wins where the edition has one, so a siglum
 * still follows the stemma and a written-out label cannot freeze it.
 */
const reference = /\{\{\s*([^{}|\s]+)\s*(?:\|([^{}]*))?\}\}/g

export type NotePart =
    | { type: 'text', text: string }
    | { type: 'reference', id: string, label?: string }

/** The note in the pieces it is shown in: stretches of text and what they refer to. */
export const partsOfNote = (note: string): NotePart[] => {
    const parts: NotePart[] = []
    let read = 0

    for (const match of note.matchAll(reference)) {
        const at = match.index ?? 0
        if (at > read) parts.push({ type: 'text', text: note.slice(read, at) })
        const label = match[2]?.trim()
        parts.push({ type: 'reference', id: match[1]!, ...(label && { label }) })
        read = at + match[0].length
    }

    if (read < note.length) parts.push({ type: 'text', text: note.slice(read) })
    return parts
}

/** The ids a note refers to, in the order it names them. */
export const referencesInNote = (note: string): string[] =>
    partsOfNote(note).flatMap(part => part.type === 'reference' ? [part.id] : [])

/**
 * The note as it reads, with every reference resolved to the name the
 * edition gives that entity, or to the words the note puts in its place.
 * A reference nothing answers to keeps its id, so that the gap is visible
 * rather than silent.
 */
export const resolveNote = (note: string, nameOf: (id: string) => string | undefined): string =>
    partsOfNote(note)
        .map(part => part.type === 'text' ? part.text : nameOf(part.id) ?? part.label ?? part.id)
        .join('')
