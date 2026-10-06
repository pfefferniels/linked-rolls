/**
 * The recipes of guides/recipes.md. Each region below is the code a recipe
 * shows, and runs here against a document of the repository, so that the
 * page cannot say what the library no longer does. The page writes the
 * imports as a script would, from the package; the tests import the same
 * names from the sources, and the last tests hold the page's imports to
 * the entry points and to what the regions use.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { produce } from 'immer'
import { read, write } from 'midifile-ts'
import {
    addReason,
    asJsonLd,
    carriersOf,
    certaintyOf,
    connectVersions,
    copyOfFeature,
    createBelief,
    deletedBy,
    derivationsOf,
    editsOf,
    emulate,
    importJsonLd,
    insertedBy,
    isCommand,
    midiOf,
    migrate,
    pathIn,
    placeOf,
    predecessorOf,
    referenceCopyOf,
    setCertainty,
    siglaOf,
    snapshotOf,
    symbolsIn,
    versionIn
} from '../src/index'
import { validate } from '../src/validate'
import { welteT100System } from '../src/systems/welteT100/system'

/** A document written by release 0.1 of the format, which every recipe reads. */
const fixture = join(__dirname, 'fixtures', 'roll-0.1.json')

/** The versions of the document by id, as the recipes name them. */
const R1 = '0e5f443d-0dd9-4810-9dbe-7f5007df490f'
const R2 = '19fd4209-81cc-4d03-b2c3-fc7518dbba14'

const edition = importJsonLd(JSON.parse(readFileSync(fixture, 'utf8')))
const version = versionIn(edition, R2)!

/** A directory of its own for what a recipe writes, removed once the tests are done. */
const scratches: string[] = []
const scratch = () => {
    const directory = mkdtempSync(join(tmpdir(), 'recipes-'))
    scratches.push(directory)
    return directory
}
afterAll(() => scratches.forEach(directory => rmSync(directory, { recursive: true, force: true })))

describe('read an edition and check it', () => {
    it('brings a document of an earlier release up to date, checks and reads it', () => {
        const file = fixture
        // #region read
        const json = JSON.parse(readFileSync(file, 'utf8'))

        const document = migrate(json)
        if (!validate(document)) {
            const problems = (validate.errors ?? []).map(error => `${error.instancePath}: ${error.message}`)
            throw new Error(`Not an edition:\n${problems.join('\n')}`)
        }

        const edition = importJsonLd(document)
        // #endregion read

        expect(edition.versions).toHaveLength(4)
        expect(edition.copies).toHaveLength(3)

        // Unmigrated, the document fails the schema, and the errors say where.
        expect(validate(json)).toBe(false)
        expect(validate.errors?.[0]?.instancePath).toMatch(/^\/copies\//)

        // The import migrates by itself.
        expect(siglaOf(importJsonLd(json))).toEqual(siglaOf(edition))
    })
})

describe('list the versions', () => {
    it('reads the sigla off the stemma and names each parent with its certainty', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        // #region versions
        const sigla = siglaOf(edition)

        for (const version of edition.versions) {
            const parents = derivationsOf(version).map(({ parent, certainty }) => `${sigla.get(parent)} (${certainty})`)
            console.log(sigla.get(version.id), version.system.name, new URL(version.id, edition.base).href, parents.join(', '))
        }

        // A siglum follows the stemma; the id stays.
        const version = versionIn(edition, '19fd4209-81cc-4d03-b2c3-fc7518dbba14')!
        // #endregion versions
        const lines = log.mock.calls.map(call => call.join(' '))
        log.mockRestore()

        expect(lines).toContain(`R2 T-100 https://welte225.org/${R2} r1 (true)`)
        expect(lines).toContain(`r1 T-100 https://welte225.org/${R1} `)
        expect([...sigla.values()].sort()).toEqual(['R1.1', 'R2', 'R3', 'r1'])
        expect(sigla.get(version.id)).toBe('R2')
    })
})

describe('read the text of a version', () => {
    it('gives the commands in order of place, each with the copies carrying it', () => {
        // #region text
        const text = snapshotOf(edition, version.id)
            .filter(isCommand)
            .map(command => ({
                command: command.type === 'note' ? `note ${command.pitch}` : `${command.expressionType} (${command.scope})`,
                place: placeOf(edition, command),
                copies: carriersOf(edition, command).map(feature => copyOfFeature(edition, feature.id)?.id)
            }))
        // #endregion text

        expect(text.length).toBeGreaterThan(800)
        expect(text.map(({ command }) => command)).toContain('SlowCrescendoOff (treble)')

        const onsets = text.map(({ place }) => place!.from)
        expect(onsets).toEqual([...onsets].sort((a, b) => a - b))
        text.forEach(({ place }) => expect(place!.from).toBeLessThan(place!.to))

        const copies = new Set(edition.copies.map(copy => copy.id))
        text.forEach(({ copies: carrying }) => {
            expect(carrying.length).toBeGreaterThan(0)
            carrying.forEach(copy => expect(copies.has(copy!)).toBe(true))
        })

        // The places are the reference copy's millimetres: where it carries
        // a command, it puts it within a few millimetres of the place given.
        const reference = referenceCopyOf(edition)!
        snapshotOf(edition, version.id).filter(isCommand).forEach(command => {
            const place = placeOf(edition, command)!
            carriersOf(edition, command)
                .filter(feature => copyOfFeature(edition, feature.id)?.id === reference.id)
                .forEach(feature => expect(Math.abs(feature.horizontal!.from - place.from)).toBeLessThan(5))
        })
    })
})

describe('see what a version changed', () => {
    it('lists the edits against the parent with their motivations and certainty', () => {
        // #region changes
        const motivationOf = (id?: string) => version.motivations.find(motivation => motivation.id === id)

        const changes = editsOf(version).map(edit => ({
            type: edit.editType,
            motivation: motivationOf(edit.motivation)?.note,
            inserted: edit.insert ?? [],
            deleted: symbolsIn(edition, edit.delete ?? []),
            certainty: certaintyOf(edit),
            reasons: edit['@annotation']?.belief.reasons ?? []
        }))
        // #endregion changes

        expect(changes).toHaveLength(editsOf(version).length)
        expect(changes.flatMap(({ inserted }) => inserted)).toHaveLength(insertedBy(version).length)
        expect(changes.flatMap(({ deleted }) => deleted)).toHaveLength(deletedBy(version).length)
        expect(changes.map(({ motivation }) => motivation)).toContain('Weniger Akzent auf f\'')

        // What is deleted is what the version it derives from shows.
        const parent = new Set(snapshotOf(edition, predecessorOf(edition, version.id)!.id).map(symbol => symbol.id))
        changes.flatMap(({ deleted }) => deleted).forEach(symbol => expect(parent.has(symbol.id)).toBe(true))

        // The document states no belief about an edit, so each is held true.
        changes.forEach(({ certainty, reasons }) => {
            expect(certainty).toBe('true')
            expect(reasons).toEqual([])
        })
    })

    it('marks what a collation writes as unchecked, a motivation the version declares', () => {
        const collated = produce(edition, connectVersions(R2, R1))
        const recollated = versionIn(collated, R2)!

        expect(editsOf(recollated).filter(edit => edit.motivation === 'unchecked').length).toBeGreaterThan(0)
        expect(recollated.motivations.find(motivation => motivation.id === 'unchecked')?.note).toMatch(/not yet read by an editor/)
    })
})

describe('play a version as MIDI', () => {
    it('performs the version on the red Welte and writes a standard MIDI file', () => {
        const out = join(scratch(), 'R2.mid')
        // #region midi
        const { events, source } = emulate(welteT100System, version, edition)
        const midi = midiOf(events, welteT100System.name, welteT100System.defaultOptions, source)

        midi.tracks[0].push({ type: 'meta', subtype: 'endOfTrack', deltaTime: 0 })
        writeFileSync(out, write(midi.tracks, midi.header.ticksPerBeat))
        // #endregion midi

        const [track] = read(readFileSync(out)).tracks
        const noteOns = track.filter(event => event.type === 'channel' && event.subtype === 'noteOn')
        expect(noteOns).toHaveLength(events.filter(event => event.type === 'noteOn').length)
        expect(noteOns).toHaveLength(snapshotOf(edition, R2).filter(symbol => symbol.type === 'note').length)
        expect(track.at(-1)).toMatchObject({ type: 'meta', subtype: 'endOfTrack' })

        // Every note is labelled with the symbol it performs.
        const labels = new Set(track.flatMap(event => event.type === 'meta' && event.subtype === 'text' ? [event.text] : []))
        expect(labels.has(`linked-rolls (${welteT100System.name})`)).toBe(true)
        expect(labels.has(R2)).toBe(true)
        snapshotOf(edition, R2)
            .filter(symbol => symbol.type === 'note')
            .slice(0, 50)
            .forEach(note => expect(labels.has(note.id)).toBe(true))
    })
})

describe('change an edition and write it back', () => {
    it('holds an edit likely, for a reason, and writes the document as Roll Desk does', () => {
        const file = join(scratch(), 'edition.jsonld')
        // #region write
        const edit = editsOf(version).find(({ motivation }) => motivation === 'less-accent-on-f')!
        const path = pathIn(edition, edit.id)!

        const changed = produce(edition, draft => {
            createBelief(path)(draft)
            setCertainty(path, 'likely')(draft)
            addReason(path, { type: 'simpleArgumentation', note: 'The change is clear on one copy only.' })(draft)
        })

        const output = asJsonLd(changed)
        if (!validate(output)) throw new Error('The changed edition does not hold to the schema')
        writeFileSync(file, JSON.stringify(output, null, 4) + '\n')
        // #endregion write

        // The edition it started from stays as it was, and frozen.
        expect(certaintyOf(edit)).toBe('true')
        expect(Object.isFrozen(edition)).toBe(true)
        expect(Object.isFrozen(changed)).toBe(true)

        const written = readFileSync(file, 'utf8')
        expect(written.startsWith('{\n    "@context": [')).toBe(true)
        expect(written.endsWith('}\n')).toBe(true)

        const reread = importJsonLd(JSON.parse(written))
        const held = editsOf(versionIn(reread, R2)!).find(({ id }) => id === edit.id)!
        expect(certaintyOf(held)).toBe('likely')
        expect(held['@annotation']?.belief.reasons).toEqual([
            { type: 'simpleArgumentation', note: 'The change is clear on one copy only.' }
        ])
    })
})

describe('the page', () => {
    const page = readFileSync(join(__dirname, '..', 'guides', 'recipes.md'), 'utf8')
    const tests = readFileSync(__filename, 'utf8')
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

    /** The names an import statement binds, by the module it names. */
    const importsIn = (text: string): [string, string[]][] =>
        [...text.matchAll(/^import \{([^}]+)\} from '([^']+)'/gm)]
            .map(([, names, module]) => [module, names.split(',').map(name => name.trim()).filter(Boolean)])

    /** The code of a region of this file, as the page includes it. */
    const regionOf = (name: string): string =>
        tests.split(`// #region ${name}\n`)[1].split(`// #endregion ${name}\n`)[0]

    /** The recipes of the page: what each imports and the regions it includes. */
    const recipes = page.split(/^## /m).slice(1).map(section => ({
        heading: section.split('\n')[0],
        imports: importsIn(section),
        regions: [...section.matchAll(/\{@includeCode \.\.\/test\/recipes\.test\.ts#([\w-]+)\}/g)].map(([, name]) => name)
    }))

    it('includes every region of this file once, and none it lacks', () => {
        const regions = [...tests.matchAll(/^\s*\/\/ #region (\S+)$/gm)].map(([, name]) => name)
        expect(recipes.flatMap(recipe => recipe.regions).sort()).toEqual([...regions].sort())
        recipes.forEach(recipe => expect(recipe.regions, recipe.heading).toHaveLength(1))
    })

    it('imports from the package only what its entry points export', async () => {
        const fromPackage = recipes.flatMap(recipe => recipe.imports).filter(([module]) => module.startsWith('linked-rolls'))
        expect(fromPackage.length).toBeGreaterThanOrEqual(recipes.length)

        for (const [module, names] of fromPackage) {
            const built: string = manifest.exports[`.${module.slice('linked-rolls'.length)}`].default
            const source = join(__dirname, '..', built.replace(/^\.\/lib\//, 'src/').replace(/\.js$/, '.ts'))
            const exported = await import(source)
            names.forEach(name => expect(exported, `${name} from ${module}`).toHaveProperty(name))
        }
    })

    it('imports in each recipe what its code uses', () => {
        const bound = new Set(importsIn(tests).filter(([module]) => module !== 'vitest').flatMap(([, names]) => names))
        recipes.forEach(({ heading, imports, regions }) => {
            const imported = new Set(imports.flatMap(([, names]) => names))
            const code = regions.map(regionOf).join('\n')
                .replace(/\/\/.*$/gm, '')
                .replace(/'[^'\n]*'/g, '')
            const used = new Set([...code.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*/g)].map(([name]) => name).filter(name => bound.has(name)))
            expect([...used].filter(name => !imported.has(name)), heading).toEqual([])
        })
    })
})
