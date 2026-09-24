import type { EditionView } from "../view/EditionView.js";
import type { Expression, Note } from "../model/Symbol.js";
import type { TrackerBar } from "../systems/TrackerBar.js";
import type { NegotiatedEvent } from "../systems/ReproducingSystem.js";

/**
 * The symbol as a performance needs it: where it lies, and the
 * position the performing bar reads it on.
 *
 * Nothing where that bar reads nothing of it, which is the case a
 * transfer between systems leaves behind: a red `ForzandoOn` a
 * green version still inherits cannot be performed on a green
 * machine, and an edit has yet to say what took its place.
 */
export const negotiatedEventOf = (view: EditionView, symbol: Note | Expression, bar: TrackerBar): NegotiatedEvent | null => {
    const horizontal = view.placeOf(symbol)
    const position = bar.positionOf(symbol)
    if (!horizontal || position === undefined) return null

    return {
        ...symbol,
        horizontal,
        vertical: { unit: 'track', from: position }
    }
}
