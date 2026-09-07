import { conditions } from "./Feature";
import { rollConditions } from "./RollCopy";
import { systemOf } from "./TrackerBar";
import { welteT100 } from "./systems/welteT100/bar";
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
        }
    }
}

const migrateNode = (node: Json): Json =>
    [withRenamedKeys, withTypology, withReferences, withKeeper, withProductionNodes]
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

/**
 * Every 0.1 edition was read with the T-100 tracker bar, so a roll
 * without a system is a T-100 roll. The text a copy's production
 * gave for the system is kept as the name.
 */
const withRollSystem = (edition: Json): Json => {
    if (!edition.roll || edition.roll.system) return edition
    const stated = (edition.copies ?? [])
        .map((copy: Json) => copy.production?.system ?? copy.productionEvent?.system)
        .find((system: unknown) => typeof system === 'string' && system !== '')
    const { id, ...concept } = systemOf(welteT100)
    const system = { '@id': id, ...concept, ...(stated && { name: stated }) }
    return { ...edition, roll: { ...edition.roll, system } }
}

/** An edition written before the editors were carried names none. */
const withEditors = (edition: Json): Json =>
    !edition.creation || edition.creation.editors
        ? edition
        : { ...edition, creation: { ...edition.creation, editors: [] } }

export const migrate = (edition: Json): Json => walk(withRollSystem(withEditors(edition)))
