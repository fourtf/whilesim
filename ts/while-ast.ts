import * as bigInt from 'big-integer';

abstract class Instruction {
    lineNr = 0;

    abstract exec(state: Execution): void;
}

class While extends Instruction {
    constructor(public op: string, public instructions: Instruction[]) {
        super();
    }

    exec(state: Execution) {
        if (state.variables[this.op] > bigInt.zero) {
            state.stack.push(new State(this.instructions, 0));
        } else {
            state.stack[state.stack.length - 1].index++;
        }
    }
}

class Add extends Instruction {
    constructor(
        public leftOp: string,
        public rightOp: string,
        public constant: bigInt.BigInteger,
        public isNegative: boolean
    ) {
        super();
    }

    exec(state: Execution) {
        let newVar = state.variables[this.rightOp];

        if (this.isNegative) {
            newVar = newVar.minus(this.constant);
        } else {
            newVar = newVar.plus(this.constant);
        }

        if (newVar.isNegative()) {
            newVar = bigInt.zero;
        }

        state.variables[this.leftOp] = newVar;
        state.stack[state.stack.length - 1].index++;
    }
}

export class Ast {
    error: string = null;

    constructor(
        public instructions: Instruction[],
        public variables: string[],
    ) { }
}

class State {
    constructor(
        public instructions: Instruction[],
        public index: number) { }
}

export class Execution {
    variables = {};
    stack = [];
    finished = false;
    lineNr = 0;
    totalSteps = 0;
    didRun = false;
    runSteps = 100000;

    constructor(
        public ast: Ast,
    ) {
        for (const v of ast.variables) {
            this.variables[v] = bigInt(0);
        }

        this.stack.push(new State(ast.instructions, 0));

        let firstInst = ast.instructions[0];
        if (firstInst) {
            this.lineNr = firstInst.lineNr;
        }
    }

    step() {
        let changed = false;
        let tryReturn = () => {
            while (this.stack.length != 0) {
                const top = this.stack[this.stack.length - 1];
                const inst = top.instructions[top.index];

                if (inst == undefined) {
                    changed = true;
                    // this.totalSteps++;
                    this.stack.pop();
                } else {
                    break;
                }
            }
        };
        tryReturn();

        if (!changed) {
            if (this.stack.length == 0) {
                this.finished = true;
                return;
            } else {
                const top = this.stack[this.stack.length - 1];
                const inst = top.instructions[top.index];

                if (inst != undefined) {
                    inst.exec(this);

                    this.totalSteps++;
                }
            }
            tryReturn();
        }

        {
            const top = this.stack[this.stack.length - 1];
            const inst = top == undefined ? undefined : top.instructions[top.index];
            if (inst == undefined) {
                this.lineNr = null;
            } else {
                this.lineNr = inst.lineNr;
            }
        }
    }

    run() {
        this.didRun = true;

        for (let i = 0; i < this.runSteps; i++) {
            this.step();

            if (this.finished) {
                break;
            }
        }
    }
}

const $nl = "(?:\r\n|\n|\r|$)";
const $space = `(?:\\s+|/\\*(?:.|\\r|\\n)*?\\*/|//.*${$nl})*`;
const $requiredSpace = `(?:\\s+|/\\*(?:.|\\r|\\n)*?\\*/|//.*${$nl})+`;
const $N0 = "(?:0|[1-9][0-9]*)";
const $variable = "([xX]" + $N0 + ")";

const requiredSpace = RegExp("^" + $requiredSpace);
const while_ = RegExp("^" + ["WHILE", "\\(?", $variable, ">", "0", "\\)?", "DO"].join($space), "i");
export const op = RegExp("^" + [$variable, ":?=", $variable, "([-+])", "(" + $N0 + ")", ";"].join($space), "i")

export function whileParse(code: string): Ast {
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
