import * as bigInt from "big-integer";
import { Ast, Add, While, Instruction } from './simulation';

const $nl = "(?:\r\n|\n|\r|$)";
const $space = `(?:\\s+|/\\*(?:.|\\r|\\n)*?\\*/|//.*${$nl})*`;
const $requiredSpace = `(?:\\s+|/\\*(?:.|\\r|\\n)*?\\*/|//.*${$nl})+`;
const $N0 = "(?:0|[1-9][0-9]*)";
const $variable = "([xX]" + $N0 + ")";

const requiredSpace = RegExp("^" + $requiredSpace);
const while_ = RegExp("^" + ["WHILE", "\\(?", $variable, ">", "0", "\\)?", "DO"].join($space), "i");
export const op = RegExp("^" + [$variable, ":?=", $variable, "([-+])", "(" + $N0 + ")", ";"].join($space), "i")

export function parse(code: string): Ast {
    let str = code;
    let tokens = [];
    let success = false;
    let error = false;
    const variables = { x0: null };
    const instRoot: Instruction[] = [];
    const instStack: Instruction[][] = [instRoot];

    let funcs: [RegExp, (match: RegExpExecArray) => Instruction][] = [
        [requiredSpace, match => { return null; }],
        [while_, match => {
            const x = match[1].toLowerCase();
            tokens.push("while " + x);
            variables[x] = null;

            const instructions: Instruction[] = [];
            const inst = new While(x, instructions);
            instStack[instStack.length - 1].push(inst);
            instStack.push(instructions);
            return inst;
        }],
        [op, match => {
            const xl = match[1].toLowerCase(), xr = match[2].toLowerCase(), op = match[3], c = match[4];
            tokens.push("op " + xl + xr + c);
            variables[xl] = null;
            variables[xr] = null;

            const inst = new Add(xl, xr, bigInt(c), op == "-");
            instStack[instStack.length - 1].push(inst);
            return inst;
        }],
        [/^END;?/i, match => {
            tokens.push("end");
            instStack.pop();

            if (instStack.length == 0) {
                error = true;
            }
            return null;
        }],
        [/^$/, match => {
            tokens.push("eof");
            success = true;
            return null;
        }],
        [/./, match => {
            error = true;
            return null;
        }]
    ];

    let max = 1000000;
    let strIndex = 0;
    let lineNr = 1;

    outer:
    while (--max != 0 && !success) {
        //console.log(str);
        for (const func of funcs) {
            const match = func[0].exec(str);
            if (match != null) {
                let inst = func[1](match);

                if (error) {
                    let startIndex = code.lastIndexOf('\n', strIndex);
                    let endIndex = code.indexOf('\n', strIndex);
                    if (startIndex == -1) startIndex = 0;
                    if (endIndex == -1) endIndex = code.length;

                    let ast = new Ast(null, null);
                    ast.error = "error in line " + (countLines(code, 0, startIndex + 1) + 1) +
                        " :" + code.substring(startIndex, endIndex);
                    return ast;
                }

                if (inst) {
                    inst.lineNr = lineNr;
                }
                str = str.substr(match[0].length);
                lineNr += countLines(code, strIndex, strIndex + match[0].length);
                strIndex += match[0].length;
                continue outer;
            }
        }
        break outer;
    }

    // console.log(tokens);

    const vars = [];
    for (let x in variables) {
        vars.push(x);
    }
    vars.sort();

    return new Ast(instRoot, vars);
}

function countLines(str: string, from: number, index: number) {
    let lineCount = 0;
    for (let i = from; i < Math.min(index, str.length); i++) {
        if (str[i] == '\n') {
            lineCount++;
        }
    }
    return lineCount;
}