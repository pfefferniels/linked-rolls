import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import welteLicenseeContext from '../src/spec/welte-licensee.context.json'
import welteT98Context from '../src/spec/welte-t98.context.json'
import { assignDate, notAfter, notBefore } from '../src/Assumption'
import { asJsonLd } from '../src/asJsonLd'
import { edition as smallEdition } from './editionFixture'

/**
 * A date is the time-span of the event. The day it falls within is the
 * outer boundary of that span, and where nobody can give the day the
 * two ends of the boundary are given instead. A bound that is left out
 * is what "not before" and "not after" say.
 */

type Json = any

const contexts: Record<string, Json> = {
    'https://w3id.org/reo/context.jsonld': context,
    'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context,
    'https://w3id.org/reo/welte-licensee/context.jsonld': welteLicenseeContext,
    'https://w3id.org/reo/welte-green/context.jsonld': welteT98Context
}

const documentLoader = async (url: string) => {
    const document = contexts[url]
    if (!document) throw new Error(`no local copy of ${url}`)
    return { contextUrl: undefined, documentUrl: url, document }
}

const crm = 'http://www.cidoc-crm.org/cidoc-crm/'
const date = (value: string) => `"${value}"^^<http://www.w3.org/2001/XMLSchema#date>`

/** An edition dated every way the format allows, as N-Quads. */
const dated = async (): Promise<string> => {
    const edition = smallEdition()
    edition.base = 'https://example.org/edition/'
    edition.roll.recordingEvent.date = assignDate(new Date(1905, 0, 20))
    edition.copies[0].production!.date = notBefore(new Date(1924, 8, 1))
    edition.copies[1].production!.date = notAfter(new Date(1932, 11, 31))
    edition.copies[1].readFrom = {
        kind: 'scan',
        date: { after: new Date(1924, 8, 1), before: new Date(1932, 11, 31) }
    }

    return await jsonld.toRDF(asJsonLd(edition), {
        format: 'application/n-quads',
        documentLoader
    }) as unknown as string
}

const occurrences = (quads: string, property: string): string[] =>
    quads.split('\n').filter(line => line.includes(`<${crm}${property}>`))

describe('a date as a time-span', () => {
    it('states the day an exact date falls within', async () => {
        expect(occurrences(await dated(), 'P82_at_some_time_within'))
            .toHaveLength(1)
        expect(await dated()).toContain(`<${crm}P82_at_some_time_within> ${date('1905-01-20')}`)
    })

    it('gives only the lower bound where the date is not before a day', async () => {
        const quads = await dated()
        expect(occurrences(quads, 'P82a_begin_of_the_begin')).toHaveLength(2)
        expect(quads).toContain(`<${crm}P82a_begin_of_the_begin> ${date('1924-09-01')}`)
    })

    it('gives only the upper bound where the date is not after a day', async () => {
        const quads = await dated()
        expect(occurrences(quads, 'P82b_end_of_the_end')).toHaveLength(2)
        expect(quads).toContain(`<${crm}P82b_end_of_the_end> ${date('1932-12-31')}`)
    })

    /** The bounds belong to a span of the event, not to the event itself. */
    it('hangs every span off the event it times', async () => {
        const quads = await dated()
        const spans = occurrences(quads, 'P4_has_time-span')
            .map(line => line.split(' ')[2])
        const bounded = ['P82_at_some_time_within', 'P82a_begin_of_the_begin', 'P82b_end_of_the_end']
            .flatMap(property => occurrences(quads, property).map(line => line.split(' ')[0]))

        expect(spans.length).toBeGreaterThan(0)
        expect(bounded.filter(subject => !spans.includes(subject))).toEqual([])
    })

    /** A copy's measuring software is dated by the day it ran, which is no span. */
    it('leaves the date of a measurement a plain one', async () => {
        const edition = smallEdition()
        edition.base = 'https://example.org/edition/'
        edition.copies[0].measurements.measuredBy = {
            software: 'SUPRA',
            version: '1.0',
            date: new Date(2020, 0, 1)
        }

        const quads = await jsonld.toRDF(asJsonLd(edition), {
            format: 'application/n-quads',
            documentLoader
        }) as unknown as string

        expect(quads).toContain(`<http://purl.org/dc/terms/date> ${date('2020-01-01')}`)
    })
})
