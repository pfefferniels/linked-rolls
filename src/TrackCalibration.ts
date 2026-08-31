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
    offset: number

    /** Distance between the centres of adjacent tracks. */
    separation: number

    /** Added to the scanning software's numbering to reach the tracker bar. */
    shift: number
}

/** Image column at the centre of a tracker bar track. */
export const columnOf = (track: number, calibration: TrackCalibration) =>
    calibration.offset + (track - calibration.shift) * calibration.separation

/** Tracker bar track covering an image column, unrounded. */
export const trackAt = (column: number, calibration: TrackCalibration) =>
    (column - calibration.offset) / calibration.separation + calibration.shift

/**
 * The columns covered by a run of tracks, from the outer edge of the
 * first to the outer edge of the last.
 */
export const columnsOf = (
    from: number,
    to: number,
    calibration: TrackCalibration
) => {
    const [lower, upper] = from <= to ? [from, to] : [to, from]
    const start = columnOf(lower, calibration) - calibration.separation / 2
    const end = columnOf(upper, calibration) + calibration.separation / 2
    return { from: start, to: end, width: end - start }
}
