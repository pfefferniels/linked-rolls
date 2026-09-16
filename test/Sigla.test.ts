import { describe, expect, it } from 'vitest'
import { assignReference } from '../src/Assumption'
import { siglaOf, siglumOf } from '../src/sigla'
import { systemOf, TrackerBar } from '../src/TrackerBar'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { Version } from '../src/Version'

const version = (id: string, bar: TrackerBar, basedOn?: string): Version => ({
    type: 'Version',
    id,
    system: systemOf(bar),
    edits: [],
    motivations: [],
    ...(basedOn ? { basedOn: [assignReference(basedOn)] } : {})
})

const siglaFor = (versions: Version[]) => Object.fromEntries(siglaOf({ versions }))

describe('reading the sigla off the stemma', () => {
    it('counts the generations of the system the versions are coded for', () => {
        const versions = [
            version('root', welteT100),
            version('second', welteT100, 'root'),
            version('third', welteT100, 'second')
        ]

        expect(siglaFor(versions)).toEqual({ root: 'R1', second: 'R2', third: 'R3' })
    })

    it('hangs a branch off the generation it leaves', () => {
        const versions = [
            version('root', welteT100),
            version('branch', welteT100, 'root'),
            version('second', welteT100, 'root'),
            version('third', welteT100, 'second')
        ]

        expect(siglaFor(versions)).toEqual({ root: 'R1', branch: 'R1.1', second: 'R2', third: 'R3' })
    })

    it('appends again where a branch itself branches', () => {
        const versions = [
            version('root', welteT100),
            version('second', welteT100, 'root'),
            version('third', welteT100, 'second'),
            version('fourth', welteT100, 'third'),
            version('branch', welteT100, 'second'),
            version('twig', welteT100, 'branch')
        ]

        expect(siglaFor(versions)).toMatchObject({ third: 'R3', fourth: 'R4', branch: 'R2.1', twig: 'R2.1.1' })
    })

    it('begins the first generation of a system a transfer enters', () => {
        const versions = [
            version('root', welteT100),
            version('second', welteT100, 'root'),
            version('licensee', welteLicensee, 'root'),
            version('green', welteT98, 'second')
        ]

        expect(siglaFor(versions)).toEqual({ root: 'R1', second: 'R2', licensee: 'L1', green: 'G1' })
    })

    it('counts further transfers into one system by the generation they leave', () => {
        const versions = [
            version('root', welteT100),
            version('fromSecond', welteLicensee, 'second'),
            version('second', welteT100, 'root'),
            version('fromRoot', welteLicensee, 'root')
        ]

        expect(siglaFor(versions)).toMatchObject({ fromRoot: 'L1', fromSecond: 'L2' })
    })

    it('hangs a version derived within the entered system off the transfer', () => {
        const versions = [
            version('root', welteT100),
            version('licensee', welteLicensee, 'root'),
            version('revised', welteLicensee, 'licensee')
        ]

        expect(siglaFor(versions)).toMatchObject({ licensee: 'L1', revised: 'L1.1' })
    })

    it('runs the main line on through an only child, however the stemma ends', () => {
        const versions = [
            version('root', welteT100),
            version('second', welteT100, 'root'),
            version('leaf', welteT100, 'second')
        ]

        expect(siglaFor(versions)).toMatchObject({ second: 'R2', leaf: 'R3' })
    })

    it('runs the main line through the child that carries the most of the stemma', () => {
        const versions = [
            version('root', welteT100),
            version('slim', welteT100, 'root'),
            version('slimChild', welteT100, 'slim'),
            version('broad', welteT100, 'root'),
            version('broadChild', welteT100, 'broad'),
            version('broadGrandchild', welteT100, 'broadChild')
        ]

        expect(siglaFor(versions)).toMatchObject({ broad: 'R2', slim: 'R1.1', slimChild: 'R1.1.1' })
    })

    it('names a version of the stemma of WM 225 as the edition does', () => {
        const versions = [
            version('a', welteT100),
            version('a1', welteT100, 'a'),
            version('b', welteT100, 'a'),
            version('b2', welteT100, 'b'),
            version('c', welteT100, 'b2'),
            version('c1', welteT100, 'c'),
            version('d1', welteLicensee, 'c'),
            version('d2', welteT98, 'c'),
            version('d3', welteLicensee, 'b2')
        ]

        expect(siglaFor(versions)).toEqual({
            a: 'R1', b: 'R2', b2: 'R3', c: 'R4', a1: 'R1.1', c1: 'R5', d3: 'L1', d1: 'L2', d2: 'G1'
        })
        expect(siglumOf({ versions }, 'd3')).toBe('L1')
    })

    it('leaves a version nothing answers for out of the sigla', () => {
        expect(siglumOf({ versions: [] }, 'nowhere')).toBeUndefined()
    })
})
