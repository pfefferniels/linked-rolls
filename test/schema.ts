import schema from '../src/schema.json'

type Json = any

/** The definition a `$ref` points to, or the node itself where it names none. */
export const resolve = (node: Json): Json => {
    if (!node?.$ref) return node
    const name = decodeURIComponent(node.$ref.replace('#/definitions/', ''))
    const definition = (schema as Json).definitions[name]
    if (!definition) throw new Error(`unresolved $ref ${node.$ref}`)
    return definition
}
