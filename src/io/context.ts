/**
 * The JSON-LD context of the format, which an exported edition names by
 * its address, `https://w3id.org/reo/context.jsonld`: it maps the keys of
 * the document onto the Roll Edition Ontology, CIDOC CRM, LRMoo and
 * CRMinf.
 * @category Reading and writing
 */
export { default as jsonLdContext } from '../spec/context.json' with { type: 'json' }

/**
 * The context of the Welte-Mignon T-100, added to a version coded for it.
 * @category Reading and writing
 */
export { default as welteT100JsonLdContext } from '../spec/welte-t100.context.json' with { type: 'json' }

/**
 * The context of the Welte-Mignon Licensee. Its expression terms are
 * the T-100's, the two systems differing in the tracker scale rather
 * than in the coding, so it reads them out of the T-100's vocabulary
 * rather than minting a second set of IRIs for the same commands.
 * @category Reading and writing
 */
export { default as welteLicenseeJsonLdContext } from '../spec/welte-licensee.context.json' with { type: 'json' }

/**
 * The context of the Welte-Mignon T-98, added to an edition of a green roll.
 * @category Reading and writing
 */
export { default as welteT98JsonLdContext } from '../spec/welte-t98.context.json' with { type: 'json' }
