import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { edition as smallEdition } from './editionFixture'

/**
 * A citation names the version of the edition it was made from, so that
 * a reader can tell what they cite from what has changed since.
 */

type Json = any

const contexts: Record<string, Json> = {
    'https://w3id.org/reo/context.jsonld': context,
    'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context
}

const documentLoader = async (url: string) => {
    const document = contexts[url]
    if (!document) throw new Error(`no local copy of ${url}`)
    return { contextUrl: undefined, documentUrl: url, document }
}

const versionInfo = '<http://www.w3.org/2002/07/owl#versionInfo>'

const versioned = (version?: string) => {
    const edition = smallEdition()
    edition.base = 'https://example.org/edition/'
    edition.version = version
    return edition
}

const quadsOf = async (version?: string): Promise<string> =>
    await jsonld.toRDF(asJsonLd(versioned(version)), {
        format: 'application/n-quads',
        documentLoader
    }) as unknown as string

describe('the version of an edition', () => {
    it('is stated of the edition itself', async () => {
        expect(await quadsOf('1.0'))
            .toContain(`<https://example.org/edition/> ${versionInfo} "1.0" .`)
    })

    it('comes back from an export as it went out', () => {
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(versioned('1.0')))))
        expect(back.version).toBe('1.0')
    })

    it('is stated nowhere where the edition states none', async () => {
        expect(asJsonLd(versioned())).not.toHaveProperty('version')
        expect(await quadsOf()).not.toContain(`<https://example.org/edition/> ${versionInfo}`)
    })
})
