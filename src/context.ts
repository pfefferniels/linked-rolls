export { default as jsonLdContext } from './spec/context.json'

/** The context of the Welte-Mignon T-100, added to a version coded for it. */
export { default as welteT100JsonLdContext } from './spec/welte-t100.context.json'

/**
 * The context of the Welte-Mignon Licensee. Its expression terms are
 * the T-100's, the two systems differing in the tracker scale rather
 * than in the coding, so it reads them out of the T-100's vocabulary
 * rather than minting a second set of IRIs for the same commands.
 */
export { default as welteLicenseeJsonLdContext } from './spec/welte-licensee.context.json'

/** The context of the Welte-Mignon T-98, added to an edition of a green roll. */
export { default as welteT98JsonLdContext } from './spec/welte-t98.context.json'
