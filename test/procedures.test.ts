import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { Parser } from 'n3'
import { procedures, procedureOf } from '../src/model/procedures'

/**
 * The procedures a consumer is offered have to be the ones the ontology
 * declares. The list in the library is what a consumer imports; this
 * holds it against `ontology/types.ttl`, so that a concept minted there
 * and never exported, or exported under a label it does not carry, fails
 * here rather than in an edition.
 */

const CRM = 'http://www.cidoc-crm.org/cidoc-crm/'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

const quads = new Parser().parse(readFileSync('ontology/types.ttl', 'utf-8'))

const subjectsTyped = (type: string): string[] => quads
    .filter(quad => quad.predicate.value === RDF_TYPE && quad.object.value === type)
    .map(quad => quad.subject.value)

const labelIn = (subject: string, language: string): string | undefined => quads
    .find(quad => quad.subject.value === subject
        && quad.predicate.value === `${RDFS}label`
        && quad.object.termType === 'Literal'
        && quad.object.language === language)
    ?.object.value

const declared = subjectsTyped(`${CRM}E29_Design_or_Procedure`)

describe('the procedures of the type vocabulary', () => {
    it('exports every one the ontology declares', () => {
        expect([...procedures].map(procedure => procedure.id).sort())
            .toEqual([...declared].sort())
    })

    it('names each one as the ontology labels it', () => {
        expect(procedures.map(procedure => [procedure.id, procedure.name]))
            .toEqual(procedures.map(procedure => [procedure.id, labelIn(procedure.id!, 'de')]))
    })

    it('gives every one an English label to show', () => {
        expect(declared.filter(subject => labelIn(subject, 'en') === undefined)).toEqual([])
    })

    it('finds a procedure by its IRI and nothing else', () => {
        expect(procedureOf(procedures[0].id)).toEqual(procedures[0])
        expect(procedureOf('https://w3id.org/reo/type/procedure/revision')).toBeUndefined()
        expect(procedureOf(undefined)).toBeUndefined()
    })
})
