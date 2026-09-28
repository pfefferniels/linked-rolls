import type { EditionView } from "../view/EditionView.js";
import type { Version } from "../model/Version.js";
import { defaultTrackerBar, trackerBarOf } from "../systems/index.js";
import { paperOf, PaperOfSystem } from "./paper.js";

/** What the alignments say about the paper of the version's own system, where they say anything. */
export const paperOfVersion = (view: EditionView, version: Readonly<Version>): PaperOfSystem | undefined => {
    const system = (trackerBarOf(version.system) ?? defaultTrackerBar).id
    return paperOf(view.edition)?.systems.find(paper => paper.system === system)
}

/**
 * How a place on the edition's shared axis relates to the paper of
 * this version: place × factor = millimetres of its own paper.
 *
 * Copies cut for different systems are scaled onto one axis so that
 * they can be collated at all, which leaves a version of another
 * system carrying places in the axis copy's millimetres. A
 * performance needs the paper the roll actually ran on, unstretched,
 * and that is what the alignments of all the copies give together
 * (`paperOf`): the ratio of the version's system to the reference
 * copy's, over how far the reference copy's paper has stretched.
 *
 * Nothing where no copy of the version's system measures its paper,
 * which leaves the performance on the axis.
 */
export const toOwnPaperOf = (view: EditionView, version: Readonly<Version>): number | undefined =>
    paperOfVersion(view, version)?.toOwnPaper
