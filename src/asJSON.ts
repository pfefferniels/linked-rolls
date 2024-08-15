import { AnyNode } from "./transformers/Node"

const objectAsAttributeMap = (obj: object, map: Map<string, string | number>, name = '') => {
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object') {
            objectAsAttributeMap(value, map, `${name}${key}.`)
        }
        else {
            map.set(`${name}${key}`, value)
        }
    }
}

export const asJSON = (current: AnyNode) => {
    const attrs = { ...current } as any
    delete attrs.type
    delete attrs.children
    delete attrs.parent
    if (attrs.xmlId) delete attrs.xmlId
    if (attrs.text) delete attrs.text

    const json: any = {
        ':@': attrs
    }

    if ('text' in current) {
        json['#text'] = current.text
    }

    const children: any[] = []
    json[current.type] = children

    for (const key of Object.keys(attrs)) {
        if (Array.isArray(attrs[key])) {
            attrs[`@_${key}`] = attrs[key].join(' ')
        }
        else if (typeof attrs[key] === 'object') {
            const localAttrs = new Map<string, string | number>()
            objectAsAttributeMap(attrs[key], localAttrs)
            for (const [key, value] of localAttrs) {
                attrs[`@_${key}`] = value
            }
        }
        else {
            attrs[`@_${key}`] = attrs[key]
        }

        delete attrs[key]
    }

    if (!current.children) return json

    for (const child of current.children) {
        children.push({
            ...asJSON(child)
        })
    }

    return json
}
