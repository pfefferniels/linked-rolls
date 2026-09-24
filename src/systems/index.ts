import { Concept } from "../Agent.js"
import { systemIdOf, TrackerBar } from "../TrackerBar.js"
import { welteT100 } from "./welteT100/bar.js"
import { welteLicensee } from "./welteLicensee/bar.js"
import { welteT98 } from "./welteT98/bar.js"

/** The tracker bars the library knows, the T-100 first as the usual one. */
export const trackerBars: readonly TrackerBar[] = [welteT100, welteLicensee, welteT98]

/** The bar of a system the type vocabulary knows, from its concept. */
export const trackerBarOf = (system: Concept | undefined): TrackerBar | undefined => {
    const id = systemIdOf(system)
    return trackerBars.find(bar => bar.id === id)
}

/**
 * The bar a copy is read by where it names no system of its own: every
 * copy was read by the T-100's before the systems were told apart, and
 * `reservationsAbout` reports a copy that still relies on this.
 */
export const defaultTrackerBar: TrackerBar = welteT100
