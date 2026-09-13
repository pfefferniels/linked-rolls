import type { Definition, Json, Literal, OntologyTerm, Property, SchemaDoc, TypeExpression, Usage } from './model.ts'

type AnchorOf = (name: string) => string

const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}

const escapeHtml = (text: string): string =>
    text.replace(/[&<>"']/g, char => entities[char])

/** Escaped text in which `backtick spans` become code. */
const prose = (text: string): string =>
    escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>')

const code = (text: string): string => `<code>${escapeHtml(text)}</code>`

const literal = (value: Literal): string => code(JSON.stringify(value))

const link = (anchor: string, content: string): string =>
    `<a href="#${escapeHtml(anchor)}">${content}</a>`

const anchorLookup = (definitions: Definition[]): AnchorOf => {
    const anchors = new Map(definitions.map(definition => [definition.name, definition.anchor]))
    return name => {
        const anchor = anchors.get(name)
        if (anchor === undefined) throw new Error(`No definition named ${name}`)
        return anchor
    }
}

const kindLabel = (type: TypeExpression): string => {
    switch (type.kind) {
        case 'object': return 'object'
        case 'union': return 'one of'
        case 'enumeration': return 'enumeration'
        case 'reference': return 'alias'
        case 'primitive': return type.type
        case 'literal': return 'constant'
        case 'array': return 'array'
        case 'any': return 'any'
    }
}

/** An escaped name or path that may wrap after the characters opening or separating its parts. */
const breakable = (name: string): string =>
    name.split(/(?<=[<(|,.])/).map(escapeHtml).join('<wbr>')

const typeExpression = (type: TypeExpression, anchorOf: AnchorOf): string => {
    switch (type.kind) {
        case 'reference': return link(anchorOf(type.name), breakable(type.name))
        case 'primitive': return type.format ? `${type.type} (${escapeHtml(type.format)})` : type.type
        case 'literal': return literal(type.value)
        case 'enumeration': return type.values.map(literal).join(' | ')
        case 'array': return `array of ${grouped(type.items, anchorOf)}`
        case 'union': return type.members.map(member => typeExpression(member, anchorOf)).join(' | ')
        case 'object': return 'object'
        case 'any': return 'any'
    }
}

const isAlternatives = (type: TypeExpression): boolean =>
    (type.kind === 'union' && type.members.length > 1)
    || (type.kind === 'enumeration' && type.values.length > 1)

const grouped = (type: TypeExpression, anchorOf: AnchorOf): string => {
    const expression = typeExpression(type, anchorOf)
    return isAlternatives(type) ? `(${expression})` : expression
}

const typeSpan = (type: TypeExpression, anchorOf: AnchorOf): string =>
    `<span class="type">${typeExpression(type, anchorOf)}</span>`

const paragraph = (text?: string): string =>
    text ? `<p>${prose(text)}</p>` : ''

const ontologyTerm = (term: OntologyTerm): string =>
    `<a href="${escapeHtml(term.url)}">${escapeHtml(term.curie)}</a>`
    + (term.label ? ` ${escapeHtml(term.label)}` : '')

const ontologyLine = (terms: OntologyTerm[]): string =>
    terms.length === 0 ? '' : `<p class="ontology">Maps to ${terms.map(ontologyTerm).join(', ')}</p>`

const example = (value: Json): string =>
    `<p class="example">Example: ${code(JSON.stringify(value))}</p>`

const isKeyword = (property: Property): boolean => property.name.startsWith('@')

const keywordsFirst = (properties: Property[]): Property[] =>
    [...properties.filter(isKeyword), ...properties.filter(property => !isKeyword(property))]

const variantLabel = (member: TypeExpression, index: number): string => {
    const type = member.kind === 'object'
        ? member.properties.find(property => property.name === '@type')?.type
        : undefined
    const numbered = `Variant ${index + 1}`
    return type?.kind === 'literal' ? `${numbered} ${literal(type.value)}` : numbered
}

const propertyName = (property: Property, parents: string[]): string =>
    `<code>${parents.map(parent => `<span class="parent">${escapeHtml(parent)}.</span>`).join('')}${escapeHtml(property.name)}</code>`
    + (property.required ? ' <span class="required">required</span>' : '')

const propertyRow = (property: Property, parents: string[], anchorOf: AnchorOf): string =>
    `<tr id="${escapeHtml(property.anchor)}">`
    + `<td class="name" style="--depth: ${parents.length}">${propertyName(property, parents)}</td>`
    + `<td>${typeSpan(property.type, anchorOf)}</td>`
    + `<td>${paragraph(property.description)}${ontologyLine(property.ontology)}${property.examples.map(example).join('')}</td>`
    + '</tr>'

const variantHeading = (member: TypeExpression, index: number, depth: number): string =>
    `<tr class="variant"><th colspan="3" style="--depth: ${depth}">${variantLabel(member, index)}</th></tr>`

/** The rows of the properties that inline objects bring along, wherever they sit in the type. */
const nestedRows = (type: TypeExpression, parents: string[], anchorOf: AnchorOf): string => {
    switch (type.kind) {
        case 'object': return objectRows(type.properties, parents, anchorOf)
        case 'array': return nestedRows(type.items, parents, anchorOf)
        case 'union': return type.members.map((member, index) => variantRows(member, index, parents, anchorOf)).join('')
        default: return ''
    }
}

/** A union member's rows under a heading of their own, so they are not read as the previous member's. */
const variantRows = (member: TypeExpression, index: number, parents: string[], anchorOf: AnchorOf): string => {
    const rows = nestedRows(member, parents, anchorOf)
    return rows === '' ? '' : variantHeading(member, index, parents.length) + rows
}

const propertyRows = (property: Property, parents: string[], anchorOf: AnchorOf): string =>
    propertyRow(property, parents, anchorOf) + nestedRows(property.type, [...parents, property.name], anchorOf)

const objectRows = (properties: Property[], parents: string[], anchorOf: AnchorOf): string =>
    keywordsFirst(properties).map(property => propertyRows(property, parents, anchorOf)).join('')

const propertiesTable = (rows: string): string =>
    rows === ''
        ? ''
        : ('<div class="table-scroll"><table class="properties">'
            + '<thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead>'
            + `<tbody>${rows}</tbody>`
            + '</table></div>')

const unionMember = (member: TypeExpression, index: number, anchorOf: AnchorOf): string => {
    const rows = nestedRows(member, [], anchorOf)
    if (rows === '') return typeSpan(member, anchorOf)
    const type = member.kind === 'object' ? '' : `<p>${typeSpan(member, anchorOf)}</p>`
    return `<h3>${variantLabel(member, index)}</h3>${type}${propertiesTable(rows)}`
}

const unionMembers = (members: TypeExpression[], anchorOf: AnchorOf): string =>
    '<p class="label">One of</p>'
    + `<ul class="members">${members.map((member, index) => `<li>${unionMember(member, index, anchorOf)}</li>`).join('')}</ul>`

const definitionBody = (type: TypeExpression, anchorOf: AnchorOf): string => {
    switch (type.kind) {
        case 'object': return propertiesTable(nestedRows(type, [], anchorOf))
        case 'union': return unionMembers(type.members, anchorOf)
        case 'enumeration': return `<ul class="values">${type.values.map(value => `<li>${literal(value)}</li>`).join('')}</ul>`
        case 'reference': return `<p>Same as ${typeSpan(type, anchorOf)}</p>`
        default: return `<p>${typeSpan(type, anchorOf)}</p>${propertiesTable(nestedRows(type, [], anchorOf))}`
    }
}

const usedIn = (usages: Usage[]): string =>
    usages.length === 0
        ? ''
        : `<p class="used-in">Used in ${usages.map(usage => link(usage.anchor, `<code>${breakable(usage.label)}</code>`)).join(', ')}</p>`

const definitionSection = (definition: Definition, anchorOf: AnchorOf): string =>
    `<section id="${escapeHtml(definition.anchor)}">`
    + `<h2><code>${breakable(definition.name)}</code> <span class="kind">${escapeHtml(kindLabel(definition.type))}</span></h2>`
    + paragraph(definition.description)
    + ontologyLine(definition.ontology)
    + definitionBody(definition.type, anchorOf)
    + usedIn(definition.usedIn)
    + '</section>'

const pageHeader =
    '<header><h1>Roll Edition Format</h1><p>Schema documentation for the '
    + '<a href="https://github.com/pfefferniels/linked-rolls">linked-rolls</a> piano roll edition format. '
    + 'The vocabulary behind it is the <a href="reo/">Roll Edition Ontology</a> '
    + 'with its <a href="reo/type/">type vocabulary</a>.</p></header>'

export function renderPage(doc: SchemaDoc, stylesheet: string): string {
    const anchorOf = anchorLookup(doc.definitions)
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Roll Edition Format</title>',
        `<style>\n${stylesheet}</style>`,
        '</head>',
        '<body>',
        pageHeader,
        '<main>',
        ...doc.definitions.map(definition => definitionSection(definition, anchorOf)),
        '</main>',
        '</body>',
        '</html>',
        '',
    ].join('\n')
}
