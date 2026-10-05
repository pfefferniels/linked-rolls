import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * CITATION.cff names the release a citation points to. It is raised by
 * hand together with package.json, and a release whose citation still
 * names the one before would send its readers to the wrong code.
 */

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('CITATION.cff', () => {
    it('names the version package.json releases', () => {
        const { version } = JSON.parse(read('package.json'))
        expect(read('CITATION.cff')).toMatch(new RegExp(`^version: ${version.replace(/\./g, '\\.')}$`, 'm'))
    })
})
