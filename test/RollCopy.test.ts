import { describe, expect, test } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from '../src/RollCopy';
import { RDF } from '@inrupt/vocab-common-rdf'
import rdf from '@rdfjs/data-model'
import { rolloContext } from '../src/.ldo/rollo.context';
const path = require("path");

describe('LinkedRoll class', () => {
    test('it imports ATON files correctly', async () => {
        const file = readFileSync(path.resolve(__dirname, "./fixtures/faust.txt"));
        const contents = file.toString()
        const lr = new RollCopy()
        lr.readFromStanfordAton(contents)
        expect(lr.asDataset('https://test.org').match(null, rdf.namedNode(`http://www.ics.forth.gr/isl/CRMdig/L43_annotates`), null).size).toBe(2406)
    })

    test('it assess conditions', async () => {
        const lr = new RollCopy()

        lr.assessCondition({
            type: { '@id': 'E5ConditionState' },
            P3HasNote: 'exposure to high humidity changed to paper',
            P4HasTimeSpan: { 'P82AtSomeTimeWithin': '1970-now', type: { '@id': 'E52TimeSpan' } },
        }, 'https://orcid.org/me')

        expect(lr.asDataset('https://test.org').match(null, rdf.namedNode(RDF.type), rdf.namedNode(rolloContext.E5ConditionState as string)).size).toBe(1)
    })
})
