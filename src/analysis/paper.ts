import { Edition, referenceCopyOf } from "../model/Edition.js"
import { barOf, featuresOf, paperStretchOf, RollCopy, Strain } from "../model/RollCopy.js"
import { certaintyOf, idOf, isAsserted } from "../model/Assumption.js"
import { LengthRatio, principalDerivationOf, Version } from "../model/Version.js"
import { versionIn } from "../lookup/lookup.js"
import { witnessesOf } from "./witnesses.js"
import { SourceKind } from "../model/FeatureSource.js"
import { inMetersPerMinute, mean, MetersPerMinute, Percent, percent, SpeedMeasure } from "../model/Quantity.js"
import { defaultTrackerBar, trackerBarOf } from "../systems/index.js"

/**
 * How far the paper of one copy is taken to have stretched or shrunk
 * along the roll, as a standard deviation, where the edition has too few
 * copies of one system to say: the three red copies of Welte 225 spread
 * by 0.19 %. It includes the scanner's error along the roll, which the
 * alignment cannot tell from the paper's.
 * @category Analysis
 */
export const PAPER_SPREAD: Percent = percent(0.2)

/**
 * How far a paper speed a label or the literature states is taken to be
 * from the speed a copy was cut at: the literature gives the red roll's
 * three metres a minute as 2.9 as well (Bärtsch 2020), which is 3.4 %.
 * @category Analysis
 */
export const SPEED_TOLERANCE = 0.035

/** The kinds of source that give places on the paper, so that the length between two of them is the paper's. */
const measuringLength: ReadonlySet<SourceKind> = new Set(['roll', 'scan', 'analysis'])

/**
 * What the alignments say about one copy's paper.
 * @category Analysis
 */
export interface PaperOfCopy {
    copy: string
    /** The system the copy was cut for, by the id of its bar. */
    system: string
    /** How far its paper has stretched along the roll since it was perforated, and how surely that is known. */
    along: Strain
    /** Whether a strain measured on the copy went into it, rather than the spread of paper alone. */
    measured: boolean
}

/**
 * What the alignments say about the paper the copies of one system were cut on.
 * @category Analysis
 */
export interface PaperOfSystem {
    /** The system, by the id of its bar. */
    system: string
    /**
     * The length of this system's paper, unstretched, for a length of the
     * reference system's: one for the reference copy's own system, about
     * 0.77 for a Licensee or green re-cut of a red roll. It is the ratio
     * of the paper speeds the two were cut for.
     */
    ratio: number
    /** The standard uncertainty of the ratio. */
    ratioError: number
    /**
     * A place on the axis times this is millimetres of this system's
     * paper, unstretched: what a performance of one of its versions runs
     * on (`RollProperties.toOwnPaper`).
     */
    toOwnPaper: number
    /** The standard uncertainty of `toOwnPaper`. */
    toOwnPaperError: number
    /** The copies of the system it rests on. */
    copies: string[]
}

/**
 * What the alignments of an edition say about the paper of its copies, and how surely.
 * @category Analysis
 */
export interface PaperReading {
    /** The copy whose millimetres are the axis. */
    reference: string
    /**
     * How far one copy's paper is taken to stray from its system's, and
     * how many degrees of freedom the copies give it: none where it is
     * `PAPER_SPREAD` for want of copies.
     */
    spread: { value: Percent, degreesOfFreedom: number }
    copies: PaperOfCopy[]
    systems: PaperOfSystem[]
}

/**
 * Whether the copy's places are places on its paper, so that its length
 * between two notes is a length of paper: it is the reference copy or
 * aligned with it, and was read off the roll or an image of it. A copy
 * that names no source counts as read so. A roll reader measures time,
 * and places worked out from it are only as long as the speed they were
 * worked out with.
 */
const measuresPaper = (copy: RollCopy, reference: RollCopy): boolean =>
    (copy.id === reference.id || copy.measurements.alignment !== undefined)
    && featuresOf(copy).length > 0
    && (!copy.readFrom || measuringLength.has(copy.readFrom.kind))

/**
 * A strain in per cent as the fit takes it: the logarithm of the ratio of
 * the lengths, the true strain, which adds where the causes of a scale
 * multiply. For the tenths of a per cent paper does it is the same.
 */
const logarithmicOf = (value: number) => Math.log1p(value / 100)

/** A true strain back in per cent of the length. */
const percentOf = (logarithmic: number) => percent(Math.expm1(logarithmic) * 100)

/** The strain measured on the copy along the roll, where one is and the edition holds it. */
const measuredAlong = (copy: RollCopy): Strain | undefined => {
    const stretch = paperStretchOf(copy)
    return stretch && isAsserted(certaintyOf(stretch)) ? stretch.along : undefined
}

/** How closely an alignment's scale is known, as a share of it, at no less than a part in a million. */
const scaleShareError = (copy: RollCopy): number => {
    const alignment = copy.measurements.alignment
    if (!alignment) return 0
    const error = alignment.scaleError ?? 0
    return Math.max(Number.isFinite(error) ? error / alignment.scale : 0, 1e-6)
}

/**
 * The spread of the copies' papers about their systems', as far as
 * copies of one system can show it: each copy's length against the axis,
 * `-ln scale`, differs from another's of its system by their strains
 * alone, the ratio of the system being common to them.
 */
const spreadIn = (lengths: ReadonlyMap<string, number[]>): { value: number, degreesOfFreedom: number } => {
    const groups = [...lengths.values()]
    const degreesOfFreedom = groups.reduce((total, group) => total + group.length - 1, 0)
    if (degreesOfFreedom < 2) return { value: logarithmicOf(PAPER_SPREAD), degreesOfFreedom: 0 }

    const squares = groups.reduce((total, group) => {
        const mean = group.reduce((sum, length) => sum + length, 0) / group.length
        return total + group.reduce((sum, length) => sum + (length - mean) ** 2, 0)
    }, 0)
    return { value: Math.sqrt(squares / degreesOfFreedom), degreesOfFreedom }
}

/** The inverse of a symmetric positive definite matrix, by Gauss and Jordan. */
const inverse = (matrix: number[][]): number[][] => {
    const n = matrix.length
    const work = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
    for (let column = 0; column < n; column++) {
        const pivot = work.reduce((best, row, i) =>
            i >= column && Math.abs(row[column]) > Math.abs(work[best][column]) ? i : best, column)
        ;[work[column], work[pivot]] = [work[pivot], work[column]]
        const lead = work[column][column]
        work[column] = work[column].map(value => value / lead)
        work.forEach((row, i) => {
            if (i === column) return
            const factor = row[column]
            work[i] = row.map((value, j) => value - factor * work[column][j])
        })
    }
    return work.map(row => row.slice(n))
}

/** One equation of the fit: the unknowns it weighs, what it comes to, and how surely. */
interface Equation {
    coefficients: ReadonlyMap<number, number>
    value: number
    variance: number
}

/**
 * What the alignments of the edition say about the paper of its copies:
 * how far each copy's paper has stretched along the roll, and how long
 * the paper of each system is against the reference copy's.
 *
 * An alignment's scale is one number with three causes. A copy cut for
 * another paper speed is shorter or longer by the ratio of the speeds,
 * which the system's copies share; its paper has stretched or shrunk as
 * it alone has, and so has the reference copy's. In true strains, the
 * logarithms of the ratios of the lengths, the causes add:
 *
 *     ln scale = strain_reference − strain_copy − ln ratio_system
 *
 * The alignments give the left side to a few parts in a hundred thousand.
 * The right side has a strain for every copy and a ratio for every
 * system, so it is found by least squares with each strain taken to lie
 * about zero by the spread of paper (`PAPER_SPREAD`, or what the copies
 * show where there are enough of one system), or about a strain
 * measured on the copy by that measurement's uncertainty. Where a system
 * has one copy only its ratio takes the whole scale and the copy's strain
 * stays at zero, known no better than paper varies; where the copies of
 * the reference system are several, the axis comes out at their mean
 * paper and not at the reference copy's.
 *
 * Copies whose places are not places on the paper, such as a roll
 * reader's, say nothing about the paper and are left out. Nothing is
 * said where the edition has no reference copy.
 * @category Analysis
 */
export const paperOf = (edition: Pick<Edition, 'copies' | 'referenceCopy'>): PaperReading | undefined => {
    const reference = referenceCopyOf(edition)
    if (!reference) return undefined

    const copies = edition.copies.filter(copy => measuresPaper(copy, reference))
    if (!copies.some(copy => copy.id === reference.id)) return undefined

    const referenceSystem = barOf(reference).id
    const systemOf = (copy: RollCopy) => barOf(copy).id
    const systems = [...new Set(copies.map(systemOf))].filter(system => system !== referenceSystem)

    const lengthOf = (copy: RollCopy) =>
        copy.id === reference.id ? 0 : -Math.log(copy.measurements.alignment!.scale)
    const lengths = Map.groupBy(copies, systemOf)
    const spread = spreadIn(new Map([...lengths].map(([system, group]) => [system, group.map(lengthOf)])))

    // Unknowns: the strain of each copy, then the log ratio of each system but the reference's.
    const strainAt = new Map(copies.map((copy, i) => [copy.id, i]))
    const ratioAt = new Map(systems.map((system, i) => [system, copies.length + i]))
    const referenceAt = strainAt.get(reference.id)!

    const aligned: Equation[] = copies
        .filter(copy => copy.id !== reference.id)
        .map(copy => {
            const ratio = ratioAt.get(systemOf(copy))
            return {
                coefficients: new Map([
                    [referenceAt, 1],
                    [strainAt.get(copy.id)!, -1],
                    ...(ratio !== undefined ? [[ratio, -1] as [number, number]] : [])
                ]),
                value: Math.log(copy.measurements.alignment!.scale),
                variance: scaleShareError(copy) ** 2
            }
        })

    const measured = new Map(copies.flatMap(copy => {
        const strain = measuredAlong(copy)
        return strain ? [[copy.id, strain] as const] : []
    }))
    const priors: Equation[] = copies.map(copy => {
        const strain = measured.get(copy.id)
        const uncertainty = strain?.uncertainty !== undefined
            ? strain.uncertainty / (100 + strain.value)
            : spread.value
        return {
            coefficients: new Map([[strainAt.get(copy.id)!, 1]]),
            value: strain ? logarithmicOf(strain.value) : 0,
            variance: uncertainty ** 2
        }
    })

    const size = copies.length + systems.length
    const normal = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
    const right = Array.from({ length: size }, () => 0)
    ;[...aligned, ...priors].forEach(({ coefficients, value, variance }) => {
        const weight = 1 / variance
        coefficients.forEach((a, i) => {
            right[i] += weight * a * value
            coefficients.forEach((b, j) => { normal[i][j] += weight * a * b })
        })
    })
    const covariance = inverse(normal)
    const solution = covariance.map(row => row.reduce((total, value, j) => total + value * right[j], 0))

    const strainReference = solution[referenceAt]
    const varianceReference = covariance[referenceAt][referenceAt]

    const systemReading = (system: string): PaperOfSystem => {
        const at = ratioAt.get(system)
        const logRatio = at === undefined ? 0 : solution[at]
        const varianceRatio = at === undefined ? 0 : covariance[at][at]
        const covarianceWithReference = at === undefined ? 0 : covariance[at][referenceAt]
        const ratio = Math.exp(logRatio)
        const toOwnPaper = Math.exp(logRatio - strainReference)
        return {
            system,
            ratio,
            ratioError: ratio * Math.sqrt(varianceRatio),
            toOwnPaper,
            toOwnPaperError: toOwnPaper * Math.sqrt(Math.max(0, varianceRatio + varianceReference - 2 * covarianceWithReference)),
            copies: copies.filter(copy => systemOf(copy) === system).map(copy => copy.id)
        }
    }

    return {
        reference: reference.id,
        spread: { value: percentOf(spread.value), degreesOfFreedom: spread.degreesOfFreedom },
        copies: copies.map(copy => {
            const at = strainAt.get(copy.id)!
            return {
                copy: copy.id,
                system: systemOf(copy),
                along: {
                    value: percentOf(solution[at]),
                    uncertainty: percent(Math.exp(solution[at]) * Math.sqrt(covariance[at][at]) * 100),
                    unit: 'percent'
                },
                measured: measured.has(copy.id)
            }
        }),
        systems: [referenceSystem, ...systems].map(systemReading)
    }
}

/**
 * Where the alignments of the copies, or what they say about the paper, want looking into.
 * @category Analysis
 */
export type AlignmentProblem = {
    copy: string
    problem:
        /** The copy has features but no alignment, and is not the reference copy. */
        | 'not-aligned'
        /** It was aligned against a copy that is not the reference copy now. */
        | 'aligned-against-another-copy'
        /**
         * The speed stated for it and the reference copy's stated or
         * nominal one give another ratio of the papers than the
         * alignments, by more than a stated speed may be off.
         */
        | 'speed-disagrees-with-paper'
        /**
         * Its paper strays from its system's by more than paper does:
         * it may have been cut for another speed, or read wrongly.
         */
        | 'paper-beyond-its-spread'
    /**
     * How far: for a speed, the logarithm of the ratio the speeds give
     * over the one the alignments give; for a paper, the copy's strain in
     * per cent.
     */
    by?: number
}

/** A paper speed the edition holds true or likely, in metres a minute. */
const statedSpeed = (copy: RollCopy): MetersPerMinute | undefined => {
    const speed = copy.production?.speed
    return speed && isAsserted(certaintyOf(speed)) ? inMetersPerMinute(speed as SpeedMeasure) : undefined
}

/**
 * The speed the version's paper starts at, as the copies of its own system
 * that bear witness to it at first hand state they were cut for: the mean
 * of the speeds the edition holds true or likely. A stated speed is the
 * speed at the beginning of the roll, as a tempo marking gives it. Nothing
 * where no such copy states one; in particular, a copy that reaches the
 * version only through a later one says nothing about it, since the later
 * one may have been cut for another speed.
 * @category Analysis
 */
export const paperSpeedOf = (edition: Edition, versionId: string): MetersPerMinute | undefined => {
    const version = versionIn(edition, versionId)
    if (!version) return undefined

    const system = (trackerBarOf(version.system) ?? defaultTrackerBar).id
    const speeds = witnessesOf(edition, versionId)
        .filter(witness => witness.through === undefined)
        .flatMap(witness => edition.copies.filter(copy => copy.id === witness.copy && barOf(copy).id === system))
        .map(statedSpeed)
        .filter(speed => speed !== undefined)
    return speeds.length > 0 ? mean(speeds) : undefined
}

/** The speed the reference copy was cut at: as stated for it, or as its system runs. */
const referenceSpeed = (reference: RollCopy): MetersPerMinute | undefined => {
    const system = barOf(reference).paperSpeed
    return statedSpeed(reference) ?? (system && inMetersPerMinute(system))
}

/**
 * Where the alignments of the edition's copies, or what they say about
 * the paper, want looking into. None of it is recomputed, so it is cheap
 * to ask; whether an alignment would come out otherwise if found again
 * is `alignmentFor`'s to say.
 * @category Analysis
 */
export const alignmentProblems = (edition: Pick<Edition, 'copies' | 'referenceCopy'>): AlignmentProblem[] => {
    const reference = referenceCopyOf(edition)
    if (!reference) return []

    const unaligned = edition.copies
        .filter(copy => copy.id !== reference.id && !copy.measurements.alignment && featuresOf(copy).length > 0)
        .map(copy => ({ copy: copy.id, problem: 'not-aligned' as const }))

    const elsewhere = edition.copies
        .filter(copy => {
            const against = copy.measurements.alignment?.against
            return against !== undefined && against !== reference.id
        })
        .map(copy => ({ copy: copy.id, problem: 'aligned-against-another-copy' as const }))

    const reading = paperOf(edition)
    if (!reading) return [...unaligned, ...elsewhere]

    const beyond = reading.copies
        .filter(paper => Math.abs(paper.along.value) > 3 * PAPER_SPREAD)
        .map(paper => ({ copy: paper.copy, problem: 'paper-beyond-its-spread' as const, by: paper.along.value }))

    const speedOfReference = referenceSpeed(reference)
    const speeds = speedOfReference === undefined ? [] : reading.copies.flatMap(paper => {
        const copy = edition.copies.find(c => c.id === paper.copy)!
        const speed = copy.id === reference.id ? undefined : statedSpeed(copy)
        const system = reading.systems.find(s => s.system === paper.system)!
        if (speed === undefined) return []

        const by = Math.log((speed / speedOfReference) / system.ratio)
        const allowed = SPEED_TOLERANCE + 3 * system.ratioError / system.ratio
        return Math.abs(by) > allowed
            ? [{ copy: copy.id, problem: 'speed-disagrees-with-paper' as const, by }]
            : []
    })

    return [...unaligned, ...elsewhere, ...beyond, ...speeds]
}

/**
 * How long the version's paper runs for a length of the paper of the
 * version it derives from, as the alignments give it: the ratio of the
 * two versions' systems' papers, with its uncertainty. It is what the
 * creation of the version states where the edition holds to it
 * (`VersionCreation.lengthRatio`).
 *
 * The reading pools the copies of a system, so the ratio is only given
 * for a version that one of those copies bears witness to: a second
 * re-cut for the same system, whose copies measure no paper, is not
 * credited with the first one's ratio. Where the reading has copies of
 * two versions re-cut for one system, the ratio is theirs together.
 * Nothing is given for a version that derives from none, or from one on
 * its own system, whose paper it keeps.
 * @category Analysis
 */
export const lengthRatioOf = (edition: Edition, versionId: string): LengthRatio | undefined => {
    const version = versionIn(edition, versionId)
    const derivation = version && principalDerivationOf(version)
    const base = derivation && versionIn(edition, idOf(derivation))
    const reading = paperOf(edition)
    if (!version || !base || !reading) return undefined

    const systemOf = (of: Readonly<Version>) => reading.systems.find(paper => paper.system === trackerBarOf(of.system)?.id)
    const own = systemOf(version)
    const theirs = systemOf(base)
    if (!own || !theirs || own.system === theirs.system) return undefined

    const witnesses = new Set(witnessesOf(edition, versionId).map(witness => witness.copy))
    if (!own.copies.some(copy => witnesses.has(copy))) return undefined

    const value = own.ratio / theirs.ratio
    return { value, uncertainty: value * Math.hypot(own.ratioError / own.ratio, theirs.ratioError / theirs.ratio) }
}
