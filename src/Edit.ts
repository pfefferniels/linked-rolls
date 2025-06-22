import { v4 } from "uuid";
import { Person } from "./Edition";
import { assign, EditorialAssumption, Motivation } from "./EditorialAssumption";
import { AnySymbol, dimensionOf, ExpressionType } from "./Symbol";
import { WithId } from "./WithId";

export const editMotivations = [
    /**
     * An additional accent that can only be encoded with 
     * sforzando on/off due to the short space left between
     * the notes to be differentiated.
     */
    'short-dynamic-differentation',
    'additional-accent',
    'add-redundancy',
    'remove-redundancy',
    'replace-with-equivalent',
    'shift',
    'correct-error',
    'shorten',
    'prolong',
] as const;

export type EditMotivation = typeof editMotivations[number];

export interface ActorAssignment extends EditorialAssumption<'actorAssignment', Person> { }

/**
 * Actor should be used to indicate the person who
 * (presumably) carried out the edit. 
 */
export interface Edit extends WithId {
    actor?: ActorAssignment;
    motivation?: Motivation<EditMotivation>;
    insert?: AnySymbol[];
    delete?: AnySymbol[];
}

export const isEdit = (object: any): object is Edit => {
    return 'insert' in object || 'delete' in object;
};

const arraysIdentical = <T,>(a: T[], b: T[]) => {
    let i = a.length;
    if (i != b.length) return false;
    while (i--) {
        if (Array.isArray(a[i]) && Array.isArray(b[i])) {
            return arraysIdentical(a[i] as any[], b[i] as any[]);
        }
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const guessMotivation = (edit: Edit): EditMotivation => {
    const inserts = (edit.insert || [])
    const deletes = (edit.delete || [])

    const types = [
        inserts.filter(e => e.type === 'expression').map(e => e.expressionType),
        deletes.filter(e => e.type === 'expression').map(e => e.expressionType)
    ]

    if (arraysIdentical<ExpressionType[]>(
        types, [['SlowCrescendoOn', 'SlowCrescendoOff'], []]
    )) {
        return 'additional-accent'
    }
    else if (arraysIdentical<ExpressionType[]>(
        types, [['ForzandoOn', 'ForzandoOff'], []]
    )) {
        // TODO: check if the inserts are very close
        // and return 'short-dynamic-differentation'
        return 'additional-accent'
    }
    else if (types.every(t => t.length > 1) && arraysIdentical<ExpressionType>(
        types[0],
        types[1]
    )) {
        return 'shift'
    }
    else if (types[0].length === 0 && types[1].length === 1) {
        return 'remove-redundancy'
    }

    if (inserts.length === 1 && deletes.length === 1) {
        const insertDim = dimensionOf(inserts[0]).horizontal
        const deleteDim = dimensionOf(deletes[0]).horizontal
        
        if (Math.abs(insertDim.from - deleteDim.from) < 5) {
            const insertLength = Math.abs(insertDim.to - insertDim.from)
            const deleteLength = Math.abs(deleteDim.to - deleteDim.from)
            if (insertLength < deleteLength) {
                return 'shorten'
            }
            else {
                return 'prolong'
            }
        }
    }

    return 'correct-error'
}

export const merge = (selection: Edit[]): Edit => {
    const result = selection[0]

    selection
        .slice(1)
        .forEach(edit => {
            if (result.insert) {
                result.insert.push(...(edit.insert || []))
            }
            else {
                result.insert = edit.insert
            }

            if (result.delete) {
                result.delete.push(...(edit.delete || []))
            }
            else {
                result.delete = edit.delete
            }
        })

    return {
        ...result,
        id: v4(),
        motivation: assign('motivationAssignment', guessMotivation(result)),
    }
}
