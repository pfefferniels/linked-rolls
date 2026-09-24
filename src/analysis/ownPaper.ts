import type { EditionView } from "../view/EditionView.js";
import type { Version } from "../model/Version.js";
import { idsOf } from "../model/Assumption.js";
import { isPaperStretch, RollCopy } from "../model/RollCopy.js";
import { systemIdOf } from "../systems/TrackerBar.js";

/** The copies of the version's own system that carry any of its symbols. */
export const copiesOwning = (view: EditionView, version: Readonly<Version>): Readonly<RollCopy>[] => {
    const system = systemIdOf(version.system)
    const carrying = new Set(view.snapshot(version.id)
        .flatMap(symbol => idsOf(symbol.carriers))
        .flatMap(id => {
            const copy = view.copyOf(id)
            return copy ? [copy.id] : []
        }))

    return view.edition.copies.filter(copy =>
        carrying.has(copy.id) && systemIdOf(copy.production?.system) === system)
}

/** The scales of the version's own copies that are not their own paper stretch. */
export const speedScalesIn = (view: EditionView, version: Readonly<Version>): number[] =>
    [...new Set(copiesOwning(view, version)
        .filter(copy => !copy.conditions.some(isPaperStretch))
        .map(copy => copy.measurements.scale)
        .filter((scale): scale is number => scale !== undefined && scale > 0))]

/**
 * How a place on the edition's shared axis relates to the paper of
 * this version: place × factor = millimetres of its own paper.
 *
 * Copies cut for different systems are scaled onto one axis so that
 * they can be collated at all, which leaves a version of another
 * system carrying places in the axis copy's millimetres. A
 * performance needs the paper the roll actually ran on, and the
 * factor is the inverse of the scale `alignCopy` recorded.
 *
 * It is read only from the copies of the version's own system, since
 * under the shared axis a green version's notes are carried by red
 * copies too and those say nothing about green paper. A copy whose
 * scale is put down to its own paper having stretched is left out as
 * well: that is a fact about the one exemplar, not about the speed
 * the system's rolls were cut at. Where what remains disagrees,
 * `constraintProblems` reports it rather than averaging it away.
 */
export const toOwnPaperOf = (view: EditionView, version: Readonly<Version>): number | undefined => {
    const scales = speedScalesIn(view, version)
    return scales.length === 1 ? 1 / scales[0] : undefined
}
