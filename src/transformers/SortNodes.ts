import { AnyRollEvent } from "../types";
import { findDescendant } from "./Node";
import { Transformer } from "./Transformer";

export class SortNodes extends Transformer<undefined> {
    apply() {
        this.body.children.sort((a, b) => {
            const placeA = (findDescendant(a, 'note') || findDescendant(a, 'expression')) as AnyRollEvent | undefined
            const placeB = (findDescendant(b, 'note') || findDescendant(b, 'expression')) as AnyRollEvent | undefined

            if (!placeA || !placeB) return 0

            return placeA.hasDimension.from - placeB.hasDimension.from
        })
    }
}
