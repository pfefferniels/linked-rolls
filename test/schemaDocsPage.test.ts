import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import schema from '../src/schema.json'
import type { Json } from '../schema/docs/model'
import { propertiesIn, readSchemaDoc } from '../schema/docs/read'
import { renderPage } from '../schema/docs/render'

const stylesheet = readFileSync(new URL('../schema/docs/page.css', import.meta.url), 'utf8')
const doc = readSchemaDoc(schema as Json)
const page = renderPage(doc, stylesheet)

const attributeValues = (name: string): string[] =>
    [...page.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map(match => match[1])

describe('the format docs page', () => {
    const ids = attributeValues('id')
    const known = new Set(ids)

    it('gives every element an id of its own', () => {
        expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
    })

    it('shows every definition and property of the schema', () => {
        const anchors = doc.definitions.flatMap(definition =>
            [definition.anchor, ...propertiesIn(definition.type).map(property => property.anchor)])
        expect(anchors.filter(anchor => !known.has(anchor))).toEqual([])
    })

    it('links only to ids on the page', () => {
        const fragments = attributeValues('href')
            .filter(href => href.startsWith('#'))
            .map(href => href.slice(1))
        expect(fragments.filter(fragment => !known.has(fragment))).toEqual([])
    })
})
