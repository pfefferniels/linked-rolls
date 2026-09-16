/**
 * A note refers to a version or a copy instead of naming it, so that a
 * label the stemma decides is never written into the prose. A reference
 * reads `{{<id>}}`, where the id is the entity's, and is resolved when
 * the note is shown.
 */
const reference = /\{\{\s*([^{}\s]+)\s*\}\}/g

export type NotePart =
    | { type: 'text', text: string }
    | { type: 'reference', id: string }

/** The note in the pieces it is shown in: stretches of text and what they refer to. */
export const partsOfNote = (note: string): NotePart[] => {
    const parts: NotePart[] = []
    let read = 0

    for (const match of note.matchAll(reference)) {
        const at = match.index ?? 0
        if (at > read) parts.push({ type: 'text', text: note.slice(read, at) })
        parts.push({ type: 'reference', id: match[1]! })
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
 * edition gives that entity. A reference nothing answers to keeps its id,
 * so that the gap is visible rather than silent.
 */
export const resolveNote = (note: string, nameOf: (id: string) => string | undefined): string =>
    partsOfNote(note)
        .map(part => part.type === 'text' ? part.text : nameOf(part.id) ?? part.id)
        .join('')
