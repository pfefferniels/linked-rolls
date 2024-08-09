import { AnyElement } from "./transformers/Node"

export const asJSON = (current: AnyElement) => {
    const attrs = { ...current } as any
    delete attrs.type
    delete attrs.children
    delete attrs.parent
    delete attrs.xmlId
    attrs['xml:id'] = current.xmlId

    const json: any = {
        ':@': attrs
    }

    const children: any[] = []
    json[current.type] = children

    for (const key of Object.keys(attrs)) {
        if (Array.isArray(attrs[key])) {
            attrs[`@_${key}`] = attrs[key].join(' ')
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
