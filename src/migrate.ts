import { conditions } from "./Feature";
import { rollConditions } from "./RollCopy";
import { systemIdIn, systemOf, TrackerBar, translationBetween } from "./TrackerBar";
import { trackerBars } from "./systems";
import { welteT100 } from "./systems/welteT100/bar";
import { Track } from "./Quantity";
import { versionTypes } from "./Version";

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

const versionTypeValues = new Set<string>(versionTypes)
const conditionTypeValues = new Set<string>([...rollConditions, ...Object.values(conditions).flat()])

const renamedKeys: Record<string, string> = {
    productionEvent: 'production',
    annotates: 'depiction',
    classification: 'editType'
}

const referenceKeys = ['alignedWith', 'pairedWith', 'basedOn']

const named = (name: string) => ({ name, sameAs: [] })

const withRenamedKeys = (node: Json): Json =>
    Object.keys(node).some(key => Object.hasOwn(renamedKeys, key))
        ? Object.fromEntries(Object.entries(node).map(([key, value]) => [renamedKeys[key] ?? key, value]))
        : node

const withTypology = (node: Json): Json => {
    if (versionTypeValues.has(node['@type'])) {
        return { ...node, '@type': 'Version', versionType: node['@type'] }
    }
    if (conditionTypeValues.has(node['@type'])) {
        return { ...node, '@type': 'ConditionState', conditionType: node['@type'] }
    }
    return node
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

const migrateNode = (node: Json): Json =>
    [withRenamedKeys, withTypology, withReferences, withKeeper, withProductionNodes, withScale]
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
    version.basedOn && !version.basedOn.collationTolerance

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

const editionSteps = [withSystems, withEditors, withDerivationTolerance]

export const migrate = (edition: Json): Json =>
    walk(editionSteps.reduce((result, step) => step(result), edition))
