import { ObjectAssumption } from "./Assumption";
import { AnyFeature } from "./Feature";
import { PaperStretch, RollConditionAssignment, RollCopy, Shift } from "./RollCopy";
import { TrackerBar } from "./TrackerBar";
import { welteT100 } from "./systems/welteT100/bar";

export const applyShift = (shift: Shift, copy: RollCopy) => {
    if (copy.ops.includes('shifted')) return

    copy.features.forEach(feature => {
        feature.horizontal.from += shift.horizontal
        if (feature.horizontal.to) {
            feature.horizontal.to += shift.horizontal
        }

        feature.vertical.from += shift.vertical
        if (feature.vertical.to) {
            feature.vertical.to += shift.vertical
        }
    })
    copy.ops = [...copy.ops, 'shifted']
    copy.measurements.shift = shift
}

export const applyStretch = (
    paperStretch: ObjectAssumption<PaperStretch>,
    copy: RollCopy
) => {
    if (copy.ops.includes('stretched')) return

    const stretch = paperStretch.factor
    copy.features.forEach(feature => {
        feature.horizontal.from *= stretch
        if (feature.horizontal.to) {
            feature.horizontal.to *= stretch
        }
    })
    copy.ops = [...copy.ops, 'stretched']
    copy.conditions.push(paperStretch)
}

/** Takes the shift off the copy's features again, as far as one was applied. */
export const revertShift = (copy: RollCopy) => {
    const shift = copy.measurements.shift
    if (!copy.ops.includes('shifted') || !shift) return

    copy.features.forEach(feature => {
        feature.horizontal.from -= shift.horizontal
        if (feature.horizontal.to) {
            feature.horizontal.to -= shift.horizontal
        }

        feature.vertical.from -= shift.vertical
        if (feature.vertical.to) {
            feature.vertical.to -= shift.vertical
        }
    })
    copy.ops = copy.ops.filter(op => op !== 'shifted')
    delete copy.measurements.shift
}

const isPaperStretch = (condition: RollConditionAssignment): condition is ObjectAssumption<PaperStretch> =>
    condition.conditionType === 'paper-stretch'

/** Takes the stretch off the copy's features again, as far as one was applied. */
export const revertStretch = (copy: RollCopy) => {
    const stretch = copy.conditions.find(isPaperStretch)
    if (!copy.ops.includes('stretched') || !stretch) return

    copy.features.forEach(feature => {
        feature.horizontal.from /= stretch.factor
        if (feature.horizontal.to) {
            feature.horizontal.to /= stretch.factor
        }
    })
    copy.ops = copy.ops.filter(op => op !== 'stretched')
    copy.conditions = copy.conditions.filter(condition => !isPaperStretch(condition))
}

type AlignmentResult = {
    /** Shift in mm, applied before the stretch. */
    shift: number;
    stretch: number;
};

const isNoteOn = (bar: TrackerBar) => (feature: AnyFeature): boolean => {
    return feature.type === 'Hole' && bar.meaningOf(feature.vertical.from)?.type === 'note';
};

/**
 * Fit a line: position = alpha * index + beta via least squares.
 */
function fitIndexToPosition(indices: number[], positions: number[]) {
    const n = indices.length;
    const meanIdx = indices.reduce((s, i) => s + i, 0) / n;
    const meanPos = positions.reduce((s, p) => s + p, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        const d = indices[i] - meanIdx;
        num += d * (positions[i] - meanPos);
        den += d * d;
    }
    const alpha = den === 0 ? 1 : num / den;
    const beta = meanPos - alpha * meanIdx;
    return { alpha, beta };
}

/**
 * Selects the first and last N elements of an array (or fewer if length is smaller).
 */
function selectEnds<T>(arr: T[], count: number): T[] {
    const n = arr.length;
    if (count * 2 >= n) return arr.slice();
    return arr.slice(0, count).concat(arr.slice(n - count, n));
}

/**
 * Align two rolls by computing independent linear fits of each roll's note-onset positions
 * using only the first and last segments, then deriving a transform x2 = (x1 + shift) * stretch.
 */
export function alignFeatures(
    rollA: AnyFeature[],
    rollB: AnyFeature[],
    bar: TrackerBar = welteT100
): AlignmentResult {
    // 1. Extract note-onset positions
    const isNote = isNoteOn(bar)
    const allXA = rollA.filter(isNote).map(f => f.horizontal.from);
    const allXB = rollB.filter(isNote).map(f => f.horizontal.from);

    // 2. Determine segment size (e.g. 10% of notes, min 5)
    const segCount = Math.max(5, Math.floor(allXA.length * 0.1));

    // 3. Select only first and last segments
    const XA = selectEnds(allXA, segCount);
    const idxA = XA.map((_, i) => i);
    const XB = selectEnds(allXB, segCount);
    const idxB = XB.map((_, i) => i);

    // 4. Fit index->position for each roll on selected ends
    const { alpha: alphaA, beta: betaA } = fitIndexToPosition(idxA, XA);
    const { alpha: alphaB, beta: betaB } = fitIndexToPosition(idxB, XB);

    // 5. Derive stretch and shift such that x2 = (x1 + shift) * stretch
    const stretch = alphaB / alphaA;
    const shift = betaB / stretch - betaA;

    return { stretch, shift };
}
