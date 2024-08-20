import { AnyRollEvent } from "../types";
import { AnyBodyNode, findDescendant } from "./Node";
import { Transformer } from "./Transformer";

export class SortNodes extends Transformer<undefined> {
    apply() {
        const descendantRollEvent = (node: AnyBodyNode) => {
            return findDescendant(node, 'note')
                || findDescendant(node, 'expression')
                || findDescendant(node, 'handwrittenText')
                || findDescendant(node, 'cover')
                || findDescendant(node, 'stamp')
        }

        this.body.children.sort((a, b) => {
            const placeA = descendantRollEvent(a) as AnyRollEvent | undefined
            const placeB = descendantRollEvent(b) as AnyRollEvent | undefined

            if (!placeA || !placeB) return 0

            return placeA.hasDimension.horizontal.from - placeB.hasDimension.horizontal.from
        })
    }
}
