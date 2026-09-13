import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readSchemaDoc } from './read.ts'
import { renderPage } from './render.ts'

const [schemaPath, outputPath] = process.argv.slice(2)
if (!schemaPath || !outputPath) {
    throw new Error('usage: node schema/docs/generate.ts <schema.json> <index.html>')
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const stylesheet = readFileSync(join(import.meta.dirname, 'page.css'), 'utf8')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, renderPage(readSchemaDoc(schema), stylesheet))
