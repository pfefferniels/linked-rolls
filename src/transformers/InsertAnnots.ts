import { AnyEditorialAction } from "../EditorialActions";
import { AppNode, ChoiceNode, find, RdgNode } from "./Node";
import { Transformer } from "./Transformer";

export class InsertAnnots extends Transformer<AnyEditorialAction> {
    apply(assumption: AnyEditorialAction) {
        if (!assumption.note) return

        if (assumption.type === 'annotation') {
            this.body.children.push({
                type: 'annot',
                children: undefined, 
                parent: this.body,
                target: assumption.annotated
                    .map(event => event.id)
                    .join(' '),
                xmlId: assumption.id, 
                text: assumption.note
            })
        }
        else {
            const el = find(this.body, assumption.id) as RdgNode | AppNode | ChoiceNode
            if (!el) {
                console.log('Did not find assumption ID', assumption.id, 'in document.')
                return
            }

            el.children.push({
                type: 'annot',
                parent: el,
                children: undefined,
                text: assumption.note,
                xmlId: assumption.id
            })
        }
    }
}
