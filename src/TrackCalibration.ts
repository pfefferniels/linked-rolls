import { Pixels, px, subtract, Track, track } from "./Quantity"

/**
 * Relates a scan to the tracker bar it was read with.
 *
 * Scanning software numbers the hole columns it finds by their position
 * in the image, so its numbering is offset by however far the roll lay
 * from the edge of the scanner bed. Calibrating means finding that offset,
 * usually from a landmark such as the rewind perforation.
 *
 *     column      = offset + scannerTrack * separation
 *     trackerBar  = scannerTrack + shift
 */
export interface TrackCalibration {
    unit: 'px'

    /** Image column of the scanning software's track 0. */
    offset: Pixels

    /** Distance between the centres of adjacent tracks. */
    separation: Pixels

    /** Added to the scanning software's numbering to reach the tracker bar. */
    shift: Track
}

/** Image column at the centre of a tracker bar track. */
export const columnOf = (position: Track, calibration: TrackCalibration): Pixels =>
    px(calibration.offset + (position - calibration.shift) * calibration.separation)

/** Tracker bar track covering an image column, unrounded. */
export const trackAt = (column: Pixels, calibration: TrackCalibration): Track =>
    track((column - calibration.offset) / calibration.separation + calibration.shift)

/**
 * The columns covered by a run of tracks, from the outer edge of the
 * first to the outer edge of the last.
 */
export const columnsOf = (
    from: Track,
    to: Track,
    calibration: TrackCalibration
): { from: Pixels, to: Pixels, width: Pixels } => {
    const [lower, upper] = from <= to ? [from, to] : [to, from]
    const start = px(columnOf(lower, calibration) - calibration.separation / 2)
    const end = px(columnOf(upper, calibration) + calibration.separation / 2)
    return { from: start, to: end, width: subtract(end, start) }
}
