import type { OntologyTerm } from './model.ts'

const namespaces = new Map([
    ['crm', 'https://cidoc-crm.org/html/cidoc_crm_v7.1.3.html'],
    ['lrmoo', 'https://cidoc-crm.org/extensions/lrmoo/html/LRMoo_v1.0.html'],
    ['crminf', 'https://cidoc-crm.org/extensions/crminf/html/CRMinf_v1.0.html'],
    ['crmsci', 'https://cidoc-crm.org/extensions/crmsci/html/CRMsci_v3.2.html'],
    ['crmdig', 'https://cidoc-crm.org/crmdig/ModelVersion/version-4.0'],
    ['rdf', 'https://www.w3.org/1999/02/22-rdf-syntax-ns'],
    ['rdfs', 'https://www.w3.org/2000/01/rdf-schema'],
    ['owl', 'https://www.w3.org/2002/07/owl'],
    ['dcterms', 'https://www.dublincore.org/specifications/dublin-core/dcmi-terms'],
    // The ontology page is published beside the format docs.
    ['reo', 'reo/'],
])

/** prefix:code, then an optional label, e.g. "crm:P14 carried out by". */
const termPattern = /^([a-z]+):([A-Za-z]\w*)(?:\s+(.+))?$/

/** The terms an ontology tag names, several of them separated by commas. */
export function ontologyTerms(tag: string): OntologyTerm[] {
    return tag.split(',').map(term => ontologyTerm(term.trim()))
}

const ontologyTerm = (term: string): OntologyTerm => {
    const match = termPattern.exec(term)
    if (!match) throw new Error(`malformed ontology term "${term}"`)
    const [, prefix, code, label] = match
    const base = namespaces.get(prefix)
    if (base === undefined) throw new Error(`unknown ontology prefix "${prefix}" in "${term}"`)
    const curie = `${prefix}:${code}`
    const url = `${base}#${code}`
    return label === undefined ? { curie, url } : { curie, label, url }
}
