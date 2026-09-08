import { Concept } from "../Agent"
import { systemIdOf, TrackerBar } from "../TrackerBar"
import { welteT100 } from "./welteT100/bar"
import { welteLicensee } from "./welteLicensee/bar"
import { welteT98 } from "./welteT98/bar"

/** The tracker bars the library knows, the T-100 first as the usual one. */
export const trackerBars: readonly TrackerBar[] = [welteT100, welteLicensee, welteT98]

/** The bar of a system the type vocabulary knows, from its concept. */
export const trackerBarOf = (system: Concept | undefined): TrackerBar | undefined => {
    const id = systemIdOf(system)
    return trackerBars.find(bar => bar.id === id)
}
