import { AnyFeature } from "./Feature";
import { WelteT100 } from "./TrackerBar";

type AlignmentResult = {
    shift: number;   // shift in mm (applied before stretch)
    stretch: number; // stretch factor
};

const isNote = (feature: AnyFeature): boolean => {
    return feature.type === 'Hole' && new WelteT100().meaningOf(feature.vertical.from).type === 'note';
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
export function alignFeatures(rollA: AnyFeature[], rollB: AnyFeature[]): AlignmentResult {
    // 1. Extract note-onset positions
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
