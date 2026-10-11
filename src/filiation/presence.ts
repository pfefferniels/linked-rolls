/** Which copies carry which collated reading, which lack it, and where a copy cannot say. */
import { Edition } from "../model/Edition.js"
import { HorizontalSpan } from "../model/Feature.js"
import { barOf, RollCopy, tearsOf } from "../model/RollCopy.js"
import { Millimeters, mm } from "../model/Quantity.js"
import { TrackerBar, TrackMeaning } from "../systems/TrackerBar.js"
import { CopyCollation, reads } from "./readings.js"

/**
 * What a copy says of a reading: it carries it, it lacks it, or it
 * cannot tell, because it is torn there, its text does not reach so
 * far, or its system has no word for the reading.
 * @category Filiation
 */
export type Presence = 'present' | 'absent' | 'unknown'

/**
 * The presence of every collated reading in every copy, and the readings
 * that are ineffective in a copy carrying them.
 * @category Filiation
 */
export interface PresenceMatrix {
    copies: string[]
    /** By reading, by copy. */
    presence: Record<string, Record<string, Presence>>
    /** The readings that are ineffective where a copy carries them: a latched function set again, or cancelled again. */
    redundant: string[]
}

/** How far beyond the end of its text, or the edge of a tear, a copy cannot say what it lacks. */
export const defaultMargin = mm(3)

/** How far from a held command of the same function a copy cannot say whether it holds a latched pair. */
const HELD_REACH = mm(5)

/** The function a latching command sets or cancels, and whether it sets it, or nothing for any other. */
const latchOf = (bar: TrackerBar, meaning: TrackMeaning): { latch: string, on: boolean } | undefined => {
    if (meaning.type !== 'expression') return undefined
    const operation = bar.operationOf(meaning.expressionType)
    if (!operation || operation.spelling === 'held') return undefined
    return {
        latch: operation.sided ? `${operation.operates} ${meaning.scope}` : operation.operates,
        on: operation.spelling === 'on'
    }
}

/** The function a command operates, the side included where it counts, whatever its spelling. */
const functionOf = (bar: TrackerBar, meaning: TrackMeaning): string | undefined => {
    if (meaning.type !== 'expression') return undefined
    const operation = bar.operationOf(meaning.expressionType)
    return operation && (operation.sided ? `${operation.operates} ${meaning.scope}` : operation.operates)
}

/**
 * The readings a latched function makes no use of in the text given: a
 * command setting what is set already, or cancelling what is cancelled.
 * Commands at one place are taken cancel first, as the valves take them.
 * @category Filiation
 */
export const ineffectiveAmong = (
    bar: TrackerBar,
    readings: readonly { id: string, meaning: TrackMeaning, place: HorizontalSpan }[]
): Set<string> => {
    const byLatch = new Map<string, { id: string, at: number, on: boolean }[]>()
    for (const reading of readings) {
        const latch = latchOf(bar, reading.meaning)
        if (!latch) continue
        const commands = byLatch.get(latch.latch) ?? []
        commands.push({ id: reading.id, at: reading.place.from, on: latch.on })
        byLatch.set(latch.latch, commands)
    }
    const ineffective = new Set<string>()
    for (const commands of byLatch.values()) {
        commands.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on))
        let on = false
        for (const command of commands) {
            if (command.on === on) ineffective.add(command.id)
            on = command.on
        }
    }
    return ineffective
}

const within = (at: number, span: { from: number, to: number }, margin: Millimeters): boolean =>
    at >= span.from - margin && at <= span.to + margin

/**
 * The presence of every reading in every copy of the collation.
 *
 * A copy lacking a reading is taken to lack it only where it could show
 * it: inside its text, away from its tears, and in its own system's
 * words. A copy re-cut for a system that holds what another latches
 * carries a latched pair where one of its held commands stands for it;
 * where it holds the same function nearby without standing for the pair,
 * or where the pair was ineffective anyway, it cannot say.
 * @category Filiation
 */
export const presenceIn = (edition: Pick<Edition, 'copies'>, collation: CopyCollation, margin: Millimeters = defaultMargin): PresenceMatrix => {
    const copyOf = new Map(edition.copies.map(copy => [copy.id, copy]))
    const barFor = new Map(collation.copies.map(id => [id, barOf(copyOf.get(id)!)]))
    const placeOf = new Map<string, HorizontalSpan>()
    for (const id of collation.copies) {
        for (const feature of copyOf.get(id)!.production?.produced ?? []) {
            if ('horizontal' in feature && feature.horizontal) placeOf.set(feature.id, feature.horizontal)
        }
    }

    const redundant = new Set<string>()
    for (const copy of collation.copies) {
        const carried = collation.readings.flatMap(reading => {
            const index = reading.copies.indexOf(copy)
            if (index < 0) return []
            return [{ id: reading.id, meaning: reading.meaning, place: placeOf.get(reading.carriers[index]) ?? reading.place }]
        })
        ineffectiveAmong(barFor.get(copy)!, carried).forEach(id => redundant.add(id))
    }

    const standsFor = new Map<string, string[]>()
    for (const recoding of collation.recodings) {
        for (const replaced of recoding.replaced) standsFor.set(replaced, [...(standsFor.get(replaced) ?? []), ...recoding.by])
    }
    const copiesOf = new Map(collation.readings.map(reading => [reading.id, new Set(reading.copies)]))
    const heldBy = new Map(collation.copies.map(copy => [copy, collation.readings.filter(reading =>
        reading.meaning.type === 'expression' && copiesOf.get(reading.id)!.has(copy))]))
    const tears = new Map(collation.copies.map(copy => [copy, tearsOf(copyOf.get(copy) as RollCopy).map(tear => tear.horizontal)]))

    const presenceOf = (reading: CopyCollation['readings'][number], copy: string): Presence => {
        if (copiesOf.get(reading.id)!.has(copy)) return 'present'
        const at = reading.place.from
        if (!within(at, collation.extent[copy], margin)) return 'unknown'
        if (tears.get(copy)!.some(tear => within(at, tear, margin))) return 'unknown'
        const bar = barFor.get(copy)!
        if (reads(bar, reading.meaning)) return 'absent'
        if (reading.meaning.type !== 'expression') return 'unknown'
        if ((standsFor.get(reading.id) ?? []).some(by => copiesOf.get(by)?.has(copy))) return 'present'
        if (redundant.has(reading.id)) return 'unknown'
        const wanted = functionOf(barFor.get(reading.copies[0])!, reading.meaning)
        const held = heldBy.get(copy)!.some(other => functionOf(bar, other.meaning) === wanted
            && at >= other.place.from - HELD_REACH && at <= other.place.to + HELD_REACH)
        return held ? 'unknown' : 'absent'
    }

    const presence: PresenceMatrix['presence'] = {}
    for (const reading of collation.readings) {
        presence[reading.id] = Object.fromEntries(collation.copies.map(copy => [copy, presenceOf(reading, copy)]))
    }
    return { copies: [...collation.copies], presence, redundant: [...redundant].sort() }
}
