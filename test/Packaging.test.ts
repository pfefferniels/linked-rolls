import { describe, expect, it } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * The package is published as ESM and Node's resolver takes a specifier
 * literally: `./utils` is a file of that name and not `./utils.js`, and
 * a JSON module without an import attribute is an error. TypeScript
 * emits what the source says, so the source has to say what Node needs,
 * and a single import written without it makes the whole package
 * unimportable outside a bundler.
 */

const SOURCE = resolve(__dirname, '../src')

function* sourcesIn(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) yield* sourcesIn(full)
        else if (entry.name.endsWith('.ts')) yield full
    }
}

const isFile = (path: string): boolean => {
    try {
        return statSync(path).isFile()
    } catch {
        return false
    }
}

interface Specifier {
    file: string
    spec: string
    attribute: string
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)(['"])(\.[^'"]*)\1([^;\n]*)/g

const relativeSpecifiers = (): Specifier[] =>
    [...sourcesIn(SOURCE)].flatMap(file =>
        [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
            .map(([, , spec, rest]) => ({ file, spec, attribute: rest })))

/** Where the specifier points, reading `.js` as the TypeScript it is emitted from. */
const targetOf = ({ file, spec }: Specifier): string =>
    resolve(dirname(file), spec).replace(/\.js$/, '.ts')

describe('what the published package asks Node to resolve', () => {
    it('has relative specifiers to check, so the walk is not silently empty', () => {
        expect(relativeSpecifiers().length).toBeGreaterThan(50)
    })

    it('gives every relative specifier the extension Node needs', () => {
        const bare = relativeSpecifiers().filter(({ spec }) => !/\.(js|json)$/.test(spec))
        expect(bare.map(({ file, spec }) => `${file}: ${spec}`)).toEqual([])
    })

    it('points every one of them at a file that exists', () => {
        const missing = relativeSpecifiers()
            .filter(specifier => !specifier.spec.endsWith('.json'))
            .filter(specifier => !isFile(targetOf(specifier)))
        expect(missing.map(({ file, spec }) => `${file}: ${spec}`)).toEqual([])
    })

    it('gives every JSON module the import attribute Node requires of one', () => {
        const unattributed = relativeSpecifiers()
            .filter(({ spec }) => spec.endsWith('.json'))
            .filter(({ attribute }) => !/with\s*\{\s*type:\s*['"]json['"]\s*\}/.test(attribute))
        expect(unattributed.map(({ file, spec }) => `${file}: ${spec}`)).toEqual([])
    })
})
