/**
 * Original code by Craig Stuart Sapp <craig@ccrma.stanford.edu>.
 */

interface ParserOptions {
    // forceKeyCase: Set the case of the property name characters.
    //   '' = do not alter case of property name characters.
    //   'lc' = force property name characters to lower case.
    //   'uc' = force property name characters to upper case.
    forceKeyCase?: 'lowercase' | 'uppercase',

    // onlyChildToRoot: If the parsed output contains a single property whose
    // value is an object, then return that property value rather than the
    // root object.  This will convert:
    //    @BEGIN:X
    //    @Y:Z
    //    @END:X
    // into '{"Y":"Z"}' rather than '{"X":{"Y":"Z"}}'
    onlyChildToRoot?: boolean
}

const defaultOptions: ParserOptions = {
    onlyChildToRoot: false
}

interface ParserState {
    action?: any,
    label?: any,
    labelbegin?: any,
    labelend?: any,
    curobj: any,
    curobjname?: any,
    curkey?: any, // name of current property being processed
    ocurkey?: any, // same as curkey, but not case adjustments
    newkey?: any, // name of next property to be processed
    onewkey?: any, // same as newkey, no case adjustment
    newvalue?: any, // initial value of next property to be processed
    linenum?: any, // Current line parsing, 1-indexed.
    node: any[],        // Object parsing hierarchy.
    typer?: any,        // Database of properties to typecast.
    output?: any,         // Final output from parser.
    // options:
    keycase?: 'lowercase' | 'uppercase'
}

export class AtonParser {
    options: ParserOptions

    constructor(options?: ParserOptions) {
        this.options = options || defaultOptions
    }

    /**
     * parse ATON content and return the JSON that it describes.
     */
    parse(str: string) {
        const output = this.parseRecordArray(str.split(/\n/))
        if (this.options.onlyChildToRoot) {
            const keys = Object.keys(output);
            if ((keys.length === 1) && (typeof output[keys[0]] === 'object')) {
                return output[keys[0]];
            }
        }

        return output
    }

    /**
    * Parse ATON data from a list of individual records.
    */
    private parseRecordArray(records: string[]) {
        if (records.length === 0) return

        const state: ParserState = {
            curobj: {},
            output: {},
            node: [],
            keycase: this.options.forceKeyCase
        }

        state.curobj = state.output;
        for (let i = 0; i < records.length; i++) {
            state.linenum = i + 1;
            try {
                this.parseRecord(records[i], state);
            } catch (error) {
                console.log(error);
                return
            }
        }

        // Remove whitespace around last property value:
        this.cleanParameter(state);
        return state.curobj;
    };

    /**
     * Read an individual ATON record and process
     * according to the state given as the second parameter.
     */
    parseRecord(line: string, state: ParserState) {
        //console.log('parsing record', line)
        let matches;
        if (line.match(/^@{5,}|^@+\s|^@{1,4}$/)) {
            // Filter out comment lines.
            return;
        } else if ((typeof state.curkey === 'undefined') && line.match(/^[^@]|^$/)) {
            // Ignore unassociated text.
            return;
        } else if (matches = line.match(/^@@[^@ ]/)) {
            // Control message.
            // End current property.
            this.cleanParameter(state);
            state.curkey = undefined;
            state.ocurkey = undefined;
            if (matches = line.match(/^@@(BEGIN|START)\s*:\s*(.*)\s*$/i)) {
                state.label = matches[2];
                //console.log(state.label)
                if (typeof state.curobj[state.label] === 'undefined') {
                    // create a new object and enter into it
                    state.curobj[state.label] = {};
                    state.node.push({ label: state.label, startline: state.linenum });
                    state.curobj = state.curobj[state.label];
                } else if (state.curobj[state.label] instanceof Array) {
                    // Append at end of array of objects with same v.label and
                    // update the array index in the last v.node entry.
                    state.curobj[state.label].push({});
                    state.node.push({});
                    state.node[state.node.length - 1].index = state.curobj[state.label].length - 1;
                    state.node[state.node.length - 1].label = state.label;
                    state.node[state.node.length - 1].startline = state.linenum;
                    state.curobj = state.curobj[state.label][state.curobj[state.label].length - 1];
                } else {
                    // Single string value already exists. Convert it to an array
                    // and then append new object and enter it.
                    // var temp = state.curobj[state.label];
                    state.curobj[state.label] = [state.curobj[state.label], {}];
                    state.node.push({});
                    state.node[state.node.length - 1].index = state.curobj[state.label].length - 1;
                    state.node[state.node.length - 1].label = state.label;
                    state.node[state.node.length - 1].startline = state.linenum;
                    state.curobj = state.curobj[state.label][state.curobj[state.label].length - 1];
                }
            } else if (matches = line.match(/^@@(END|STOP)\s*:?\s*(.*)\s*$/i)) {
                // End an object, so go back to the parent.
                if (typeof state.curkey !== 'undefined') {
                    // clean whitespace of last read property:
                    state.curobj[state.curkey] = state.curobj[state.curkey].replace(/^\s+|\s+$/g, '');
                    state.curkey = undefined;
                    state.ocurkey = undefined;
                }
                state.action = matches[1];
                state.labelend = matches[2];
                state.labelbegin = state.node[state.node.length - 1].label;
                if (typeof state.node[state.node.length - 1].startline === 'undefined') {
                    throw new Error('No start for ' + state.action + ' tag on line '
                        + state.node[state.node.length - 1].startline + ': ' + line);
                    state.output = {};
                    // return v.output;
                }
                if (typeof state.labelend !== 'undefined') {
                    // ensure that the v.label begin/end tags match
                    if ((state.labelbegin !== state.labelend) && (state.labelend !== "")) {
                        throw new Error('Labels do not match on lines '
                            + state.node[state.node.length - 1].startline + ' and '
                            + state.linenum + ': "' + state.labelbegin
                            + '" compared to "' + state.labelend + '".');
                    }
                }
                // Go back to the parent object.
                if (!state.node) {
                    throw new Error('Error on line ' + state.linenum +
                        ': already at object root.');
                }
                state.node.pop();
                state.curobj = state.node.reduce(function (obj, x) {
                    return (obj[x.label] instanceof Array) ?
                        obj[x.label][x.index] : obj[x.label];
                }, state.output);
            } else if (matches = line.match(/^@@TYPE\s*:\s*([^:]+)\s*:\s*(.*)\s*$/i)) {
                // Automatic property value conversion.
                state.typer[matches[1]] = matches[2];
            }
        } else if (matches = line.match(/^@([^\s:@][^:]*)\s*:\s*(.*)\s*$/)) {
            // New property
            state.newkey = matches[1];
            state.onewkey = state.newkey;
            state.newvalue = matches[2];
            this.cleanParameter(state);
            if (state.keycase === 'uppercase') {
                state.ocurkey = state.newkey;
                state.curkey = state.newkey.toUpperCase();
            } else if (state.keycase === 'lowercase') {
                state.ocurkey = state.newkey;
                state.curkey = state.newkey.toLowerCase();
            } else {
                state.ocurkey = state.newkey;
                state.curkey = state.newkey;
            }
            if (typeof state.curobj[state.curkey] === 'undefined') {
                // create a new property
                state.curobj[state.curkey] = state.newvalue;
            } else if (state.curobj[state.curkey] instanceof Array) {
                // append next object to end of array
                state.curobj[state.curkey].push(state.newvalue);
            } else {
                // convert property value to array, and then append
                state.curobj[state.curkey] = [state.curobj[state.curkey], state.newvalue];
            }
        } else if (typeof state.curkey !== 'undefined') {
            // Continuing value from property started previously
            // If the line starts with a backslash, remove it since it is an
            //escape for the "@" sign or a literal "\" at the start of a line:
            // \@some data line   -=>  @some data line
            // \\@some data line  -=>  \@some data line
            // Only "@" and "\@" at the start of the line need to be esacaped;
            // otherwise, all other "@" and "\" characters are literal.
            // If another property marker is used other than "@", then that
            // character (or string) needs to be backslash escaped at the
            // start of a multi-line value line.
            if (line.charAt(0) !== '@') {
                if (line.slice(0, 2) === '\\@') {
                    line = line.slice(1);
                }
                if (line.slice(0, 3) === '\\\\@') {
                    line = line.slice(1);
                }
                if (state.curobj && state.curobj[state.curkey] instanceof Array) {
                    state.curobj[state.curkey][state.curobj[state.curkey].length - 1] += '\n' + line;
                } else {
                    state.curobj[state.curkey] += '\n' + line;
                }
            }
        }
    };

    /**
     * Remove whitespace from beginning and ending of value.
     * If the type should be cast to another form, also do that.
     */
    cleanParameter(v: ParserState) {
        if ((typeof v.curkey !== 'undefined') && v.curobj && v.curobj[v.curkey]) {
            var value;
            if (v.curobj[v.curkey] instanceof Array) {
                value = v.curobj[v.curkey][v.curobj[v.curkey].length - 1];
            } else if (typeof v.curobj[v.curkey] === 'string') {
                value = v.curobj[v.curkey];
            }
            value = value.replace(/^\s+|\s+$/g, '');
            if (v.typer && (typeof v.typer[v.ocurkey] !== 'undefined')) {
                var newtype = v.typer[v.ocurkey];
                if (newtype.match(/number/i)) {
                    value = Number(value);
                } else if (newtype.match(/integer/i)) {
                    value = parseInt(value);
                } else if (newtype.match(/json/i)) {
                    value = JSON.parse(value);
                }
            }
            if (v.curobj[v.curkey] instanceof Array) {
                v.curobj[v.curkey][v.curobj[v.curkey].length - 1] = value;
            } else if (typeof v.curobj[v.curkey] === 'string') {
                v.curobj[v.curkey] = value;
            }
        }
    }
}
