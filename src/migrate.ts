import { conditions, isFeatureType, media, techniques } from "./Feature.js";
import { rollConditions } from "./RollCopy.js";
import { systemIdIn, systemOf, TrackerBar, translationBetween } from "./TrackerBar.js";
import { trackerBars } from "./systems/index.js";
import { welteT100 } from "./systems/welteT100/bar.js";
import { Track } from "./Quantity.js";
import { isDateString } from "./utils.js";

/**
 * Brings the JSON of an edition written by an earlier release of the
 * format up to the current shape. The shapes are recognised
 * structurally, so a file that is current already passes through
 * unchanged, and a file may be migrated any number of times.
 *
 * Format 0.1 used the type discriminator of versions and conditions
 * for their typology, held the keeper and the production metadata as
 * strings, and named the roll system on each copy. Some 0.1 files
 * also carry references written as values and two keys the format
 * had renamed before.
 */
type Json = any

const retiredVersionTypes = new Set(['edition', 'unicum'])
const conditionTypeValues = new Set<string>([...rollConditions, ...Object.values(conditions).flat()])

const renamedKeys: Record<string, string> = {
    productionEvent: 'production',
    annotates: 'depiction',
    classification: 'editType'
}

const referenceKeys = ['alignedWith', 'pairedWith', 'basedOn']

/**
 * The five type terms that were capitalised while the rest of the
 * vocabulary was not, under the keys that carried them then.
 */
const lowerCasedTerms: Record<string, Record<string, string>> = {
    method: { Print: 'print', Handwriting: 'handwriting', Stamp: 'stamp' },
    material: { Paper: 'paper', Tape: 'tape' }
}

const named = (name: string) => ({ name, sameAs: [] })

const withRenamedKeys = (node: Json): Json =>
    Object.keys(node).some(key => Object.hasOwn(renamedKeys, key))
        ? Object.fromEntries(Object.entries(node).map(([key, value]) => [renamedKeys[key] ?? key, value]))
        : node

const withTypology = (node: Json): Json => {
    if (retiredVersionTypes.has(node['@type'])) {
        return { ...node, '@type': 'Version' }
    }
    if (conditionTypeValues.has(node['@type'])) {
        return { ...node, '@type': 'ConditionState', conditionType: node['@type'] }
    }
    return node
}

/** A version once stated whether it served as a master or stood on one copy. */
const withoutVersionType = (node: Json): Json => {
    if (!Object.hasOwn(node, 'versionType')) return node
    const { versionType: _retired, ...rest } = node
    return rest
}

/**
 * A version carried the label it was cited under, from before the sigla
 * were read off the stemma. A copy keeps its siglum, which is given by
 * hand and derives from nothing.
 */
const withoutVersionSiglum = (node: Json): Json => {
    if (node['@type'] !== 'Version' || !Object.hasOwn(node, 'siglum')) return node
    const { siglum: _labelled, ...rest } = node
    return rest
}

const withLowerCaseTerms = (node: Json): Json =>
    Object.entries(lowerCasedTerms).reduce((result, [key, terms]) => {
        const lowered = terms[result[key]]
        return lowered ? { ...result, [key]: lowered } : result
    }, node)

/** The key each term of the one-time `method` belongs under. */
const splitMethods: Record<string, 'technique' | 'medium'> = {
    ...Object.fromEntries(techniques.map(term => [term, 'technique'] as const)),
    ...Object.fromEntries(media.map(term => [term, 'medium'] as const))
}

/**
 * How a writing or a mark was put on the paper and what it was put on
 * with stood under one key, which left a handwriting no room to say it
 * was pencilled. A term the format no longer knows stays where it is,
 * so that it fails validation rather than being filed under a guess.
 */
const withSplitMethod = (node: Json): Json => {
    const key = splitMethods[node.method]
    if (!key) return node
    const { method, ...rest } = node
    return { ...rest, [key]: method }
}

const withReferences = (node: Json): Json =>
    referenceKeys.reduce((result, key) => {
        const reference = result[key]
        if (reference && typeof reference === 'object' && '@value' in reference) {
            const { '@value': id, ...rest } = reference
            return { ...result, [key]: { '@id': id, ...rest } }
        }
        return result
    }, node)

const withKeeper = (node: Json): Json => {
    if (typeof node.location !== 'string') return node
    const { location, ...rest } = node
    return { ...rest, keeper: named(location) }
}

const withProductionNodes = (node: Json): Json => {
    const production = node.production
    if (!production || typeof production !== 'object') return node
    const { company, paper, system, ...rest } = production
    return {
        ...node,
        production: {
            ...rest,
            ...(typeof company === 'string' ? (company && { company: named(company) }) : { company }),
            ...(typeof paper === 'string' ? (paper && { paper: named(paper) }) : { paper }),
            // a 0.1 file named the roll's system here as text; a copy's own system is a node
            ...(system && typeof system === 'object' && { system })
        }
    }
}

const isPaperStretch = (condition: Json): boolean =>
    condition?.conditionType === 'paper-stretch' || condition?.['@type'] === 'paper-stretch'

/**
 * The scale of an aligned copy used to be recorded only as the factor
 * of its paper-stretch condition. It is the alignment's own number
 * now, and the condition stays as the reading of it. The conditions
 * are still in their old shape here, since a node is migrated before
 * its children are.
 */
const withScale = (node: Json): Json => {
    if (!Array.isArray(node.ops) || !node.ops.includes('stretched') || node.measurements?.scale !== undefined) return node
    const factor = (node.conditions ?? []).find(isPaperStretch)?.factor
    return factor === undefined ? node : { ...node, measurements: { ...node.measurements, scale: factor } }
}

/** A derivation written as a single one, before a version could name several. */
const isSingleDerivation = (basedOn: Json): boolean =>
    basedOn !== null && typeof basedOn === 'object' && !Array.isArray(basedOn)

const withDerivationList = (node: Json): Json =>
    isSingleDerivation(node.basedOn) ? { ...node, basedOn: [node.basedOn] } : node

/** The features a copy states at a place of its own, in either shape. */
const featuresOf = (copy: Json): Json[] => [
    ...(Array.isArray(copy.features) ? copy.features : []),
    ...(Array.isArray(copy.production?.produced) ? copy.production.produced : [])
]

/**
 * A copy read on a roll reader was stated as a recording before a sound
 * recording could be one. A sound recording gives no holes, so a recording
 * with holes is a reading.
 */
const withReadingKind = (node: Json): Json =>
    node.readFrom?.kind === 'recording'
        && featuresOf(node).some((feature: Json) => feature?.['@type'] === 'Hole')
        ? { ...node, readFrom: { ...node.readFrom, kind: 'reading' } }
        : node

/** A feature written while the kind of a feature was a type beside its class. */
const withoutFeatureKind = (node: Json): Json => {
    if (!isFeatureType(node['@type']) || !Object.hasOwn(node, 'kind')) return node
    const { kind: _typed, ...rest } = node
    return rest
}

const isPatch = (feature: Json): boolean => feature?.['@type'] === 'GluedOn'

/**
 * A feature a patch bears was sometimes written without an id, and what
 * has no id can be referred to from nowhere: neither by a reading of it
 * nor by the statement that the copy bears it. It is named after the
 * patch and the place it stands in.
 */
const withBorneFeaturesNamed = (node: Json): Json => {
    const bearer = node['@id']
    if (typeof bearer !== 'string' || !Array.isArray(node.features)) return node
    if (node.features.every((feature: Json) => typeof feature?.['@id'] === 'string')) return node

    return {
        ...node,
        features: node.features.map((feature: Json, index: number) =>
            feature && typeof feature === 'object' && typeof feature['@id'] !== 'string'
                ? { '@id': `${bearer}-${index + 1}`, ...feature }
                : feature)
    }
}

/**
 * A copy held its features in one list and a modification named by id
 * what it had added. Each feature now stands in the act that brought it
 * about: a patch in an attachment, a feature an act names in an
 * alteration, and everything else in the production of the copy, which
 * is the punching. An addition naming both a patch and a feature
 * becomes two acts, since gluing something on and drawing something are
 * not one act.
 *
 * A feature a patch bears is not moved: it has no place of its own, and
 * it came onto the copy with the patch.
 */
const withFeaturesInActs = (node: Json): Json => {
    if (node['@type'] !== 'RollCopy' || !Array.isArray(node.features)) return node

    const { features, modifications, ...rest } = node
    const byId = new Map<string, Json>(features
        .filter((feature: Json) => typeof feature?.['@id'] === 'string')
        .map((feature: Json) => [feature['@id'], feature]))
    const taken = new Set<string>()

    /** The features the modification named, each going to the first act that names it. */
    const namedBy = (modification: Json): Json[] =>
        (Array.isArray(modification.added) ? modification.added : [])
            .flatMap((id: Json) => {
                if (typeof id !== 'string' || taken.has(id) || !byId.has(id)) return []
                taken.add(id)
                return [byId.get(id)]
            })

    const acts = (Array.isArray(modifications) ? modifications : []).flatMap((modification: Json): Json[] => {
        if (modification?.['@type'] !== 'Addition') return [modification]

        const { added: _named, ...act } = modification
        const held = namedBy(modification)
        const glued = held.filter(isPatch)
        const made = held.filter(feature => !isPatch(feature))
        if (glued.length === 0) return [{ ...act, '@type': 'Alteration', produced: made }]

        return [
            ...(made.length > 0 ? [{ ...act, '@type': 'Alteration', produced: made }] : []),
            { ...act, '@type': 'Attachment', added: glued }
        ]
    })

    const left = features.filter((feature: Json) => !taken.has(feature?.['@id']))
    const punched = left.filter((feature: Json) => !isPatch(feature))
    const loose = left.filter(isPatch)

    return {
        ...rest,
        ...((rest.production || punched.length > 0) && {
            production: { ...rest.production, ...(punched.length > 0 && { produced: punched }) }
        }),
        modifications: [...acts, ...(loose.length > 0 ? [{ '@type': 'Attachment', added: loose }] : [])]
    }
}

/** A keeper nobody could name was written as an empty one before a copy could leave it out. */
const withoutEmptyKeeper = (node: Json): Json => {
    if (node.keeper?.name !== '' || node.keeper.sameAs?.length) return node
    const { keeper: _unnamed, ...rest } = node
    return rest
}

/**
 * A date was a value of its own before it was the time-span the event
 * falls within. The datatype goes with it: the context now types each
 * bound, and a `@type` left on the node would read as a class.
 */
const withTimeSpanDates = (node: Json): Json => {
    if (!isDateString(node['@value'])) return node
    const { '@value': within, '@type': _typed, ...rest } = node
    return { ...rest, within }
}

const migrateNode = (node: Json): Json =>
    [withRenamedKeys, withTypology, withoutVersionType, withoutVersionSiglum, withLowerCaseTerms, withSplitMethod, withReferences, withKeeper, withoutEmptyKeeper,
        withProductionNodes, withScale, withDerivationList, withReadingKind, withTimeSpanDates, withoutFeatureKind,
        withBorneFeaturesNamed, withFeaturesInActs]
        .reduce((result, step) => step(result), node)

/** The items each walked, or the very same list where the walk changed none. */
const walked = (items: Json[]): Json[] => {
    const result = items.map(walk)
    return result.every((item, i) => item === items[i]) ? items : result
}

/** The node with each child walked, or the very same node where the walk changed none. */
const withWalkedChildren = (node: Json): Json => {
    const entries = Object.entries(node)
    const result = entries.map(([key, child]) => [key, walk(child)])
    return result.every(([, child], i) => child === entries[i][1]) ? node : Object.fromEntries(result)
}

const walk = (value: Json): Json => {
    if (Array.isArray(value)) return walked(value)
    if (value && typeof value === 'object') return withWalkedChildren(migrateNode(value))
    return value
}

/** The production of a copy, under whichever of its two names it carries. */
const productionKeyOf = (copy: Json): 'production' | 'productionEvent' =>
    copy?.productionEvent && !copy?.production ? 'productionEvent' : 'production'

/** The list under the key, or nothing where the document holds something else there. */
const listAt = (edition: Json, key: string): Json[] | undefined =>
    Array.isArray(edition[key]) ? edition[key] : undefined

/** A file written while the system belonged to the roll rather than to each version. */
const namesSystemOnTheRoll = (edition: Json): boolean =>
    edition.roll?.system !== undefined
    || (listAt(edition, 'versions') ?? []).some((version: Json) => !version?.system)

const barNamed = (system: Json): TrackerBar | undefined =>
    trackerBars.find(bar => bar.id === systemIdIn(system?.['@id']))

const withSystem = (node: Json, system: Json): Json =>
    node.system && typeof node.system === 'object' ? node : { ...node, system }

/** A span on the other bar, or nothing where that bar does not read one of its ends. */
const spanOnBar = (span: Json, at: (position: Track) => Track | undefined): Json | undefined => {
    const from = at(span.from)
    if (from === undefined) return undefined
    if (span.to === undefined) return { ...span, from }

    const to = at(span.to)
    return to === undefined ? undefined : { ...span, from, to }
}

/** The features on the copy's own bar, those it does not read left out, patches and all. */
const featuresOnBar = (features: Json[], at: (position: Track) => Track | undefined): Json[] =>
    features.flatMap((feature: Json) => {
        const vertical = feature.vertical?.unit === 'track'
            ? spanOnBar(feature.vertical, at)
            : feature.vertical
        if (!vertical) return []

        return [{
            ...feature,
            vertical,
            ...(Array.isArray(feature.features) && { features: featuresOnBar(feature.features, at) })
        }]
    })

/**
 * A copy cut for another system had its holes put onto the roll's bar
 * as it was read, so they are numbered in the roll's system and not in
 * its own. They go back onto the bar the copy names, which is the only
 * numbering that means anything once each copy is read by its own bar.
 * Between two Welte scales the difference is two tracks, which is a
 * legal position a whole tone away rather than a visible error.
 */
const onOwnBar = (copy: Json, rollSystem: Json): Json => {
    if (!copy || typeof copy !== 'object') return copy
    const key = productionKeyOf(copy)
    const own = copy[key]?.system
    const from = barNamed(rollSystem)
    const to = own && typeof own === 'object' ? barNamed(own) : undefined
    if (!from || !to || from.id === to.id || !Array.isArray(copy.features)) return copy

    return { ...copy, features: featuresOnBar(copy.features, translationBetween(from, to)) }
}

/**
 * Systems belonged to the roll before they belonged to the versions
 * and the copies. Every 0.1 edition was read with the T-100 bar, so a
 * roll that named no system was a T-100 roll, and the text a copy's
 * production gave for it is kept as the system's name.
 */
const withSystems = (edition: Json): Json => {
    if (!edition.roll || !namesSystemOnTheRoll(edition)) return edition

    const versions = listAt(edition, 'versions')
    const copies = listAt(edition, 'copies')

    const stated = (copies ?? [])
        .map((copy: Json) => copy?.[productionKeyOf(copy)]?.system)
        .find((system: unknown) => typeof system === 'string' && system !== '')
    const { id, ...concept } = systemOf(welteT100)
    const system = edition.roll.system ?? { '@id': id, ...concept, ...(stated && { name: stated }) }

    const { system: _named, ...roll } = edition.roll
    const created = roll.recordingEvent?.created

    return {
        ...edition,
        roll: created
            ? { ...roll, recordingEvent: { ...roll.recordingEvent, created: withSystem(created, system) } }
            : roll,
        ...(versions && {
            versions: versions.map((version: Json) => withSystem(version, system))
        }),
        ...(copies && {
            copies: copies.map((copy: Json) => {
                if (!copy || typeof copy !== 'object') return copy
                const key = productionKeyOf(copy)
                const onOwn = onOwnBar(copy, system)
                return { ...onOwn, [key]: withSystem(onOwn[key] ?? {}, system) }
            })
        })
    }
}

/** An edition written before the editors were carried names none. */
const withEditors = (edition: Json): Json =>
    !edition.creation || edition.creation.editors
        ? edition
        : { ...edition, creation: { ...edition.creation, editors: [] } }

const statesNoTolerance = (version: Json): boolean =>
    isSingleDerivation(version.basedOn) && !version.basedOn.collationTolerance

/**
 * The collation tolerance was the edition's before it was stated on
 * each derivation. An edition written then collated every version at
 * that one value, so it is written onto every derivation that gives
 * none of its own.
 */
const withDerivationTolerance = (edition: Json): Json => {
    const collationTolerance = edition.creation?.collationTolerance
    const versions: Json[] = Array.isArray(edition.versions) ? edition.versions : []
    if (!collationTolerance || !versions.some(statesNoTolerance)) return edition

    return {
        ...edition,
        versions: versions.map(version => statesNoTolerance(version)
            ? { ...version, basedOn: { ...version.basedOn, collationTolerance } }
            : version)
    }
}

/** A statement an export quoted rather than stated: an included node whose id is a triple. */
const isQuotedStatement = (node: Json): boolean =>
    node !== null && typeof node === 'object' && node['@id'] !== null && typeof node['@id'] === 'object'

interface QuotedReference {
    subject: string
    key: string
    listed: boolean
    reference: Json
}

/** The reference a quoted statement made, annotated again with the belief the export set beside it. */
const referenceOf = (statement: Json): QuotedReference => {
    const { '@id': { '@id': subject, ...made }, annotation, ...about } = statement
    const [key, value] = Object.entries<Json>(made)[0]
    const listed = Array.isArray(value)
    return {
        subject,
        key,
        listed,
        reference: {
            ...(listed ? value[0] : value),
            '@annotation': { ...(annotation !== undefined && { '@id': annotation }), ...about }
        }
    }
}

/** The document with each quoted reference back on the node that makes it, a node being what has a type. */
const withReferencesOn = (value: Json, bySubject: ReadonlyMap<string, QuotedReference[]>): Json => {
    if (Array.isArray(value)) return value.map(item => withReferencesOn(item, bySubject))
    if (!value || typeof value !== 'object') return value

    const walked = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withReferencesOn(child, bySubject)]))
    const references = typeof value['@id'] === 'string' && value['@type'] !== undefined
        ? bySubject.get(value['@id']) ?? []
        : []
    return references.reduce((node: Json, { key, listed, reference }) =>
        ({ ...node, [key]: listed ? [...(node[key] ?? []), reference] : reference }), walked)
}

/**
 * Puts back what an export quoted. A reference the edition doubts goes
 * out as a JSON-LD-star embedded node beside the document, so that RDF
 * does not state it; in the edition it belongs on the node that makes
 * it, under its belief. In a list it comes back after the references
 * that were stated.
 */
const withQuotedStatementsInPlace = (edition: Json): Json => {
    const included: Json[] = Array.isArray(edition['@included']) ? edition['@included'] : []
    const statements = included.filter(isQuotedStatement)
    if (statements.length === 0) return edition

    const others = included.filter(node => !isQuotedStatement(node))
    const { '@included': _quoted, ...rest } = edition
    const bySubject = Map.groupBy(statements.map(referenceOf), ({ subject }) => subject)
    return withReferencesOn({ ...rest, ...(others.length > 0 && { '@included': others }) }, bySubject)
}

const editionSteps = [withQuotedStatementsInPlace, withSystems, withEditors, withDerivationTolerance]

export const migrate = (edition: Json): Json =>
    walk(editionSteps.reduce((result, step) => step(result), edition))
