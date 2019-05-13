import * as bigInt from 'big-integer';

export abstract class Instruction {
    lineNr = 0;

    abstract exec(state: Simulation): void;
}

export class While extends Instruction {
    constructor(public op: string, public instructions: Instruction[]) {
        super();
    }

    exec(state: Simulation) {
        if (state.variables[this.op] > bigInt.zero) {
            state.stack.push(new State(this.instructions, 0));
        } else {
            state.stack[state.stack.length - 1].index++;
        }
    }
}

export class Add extends Instruction {
    constructor(
        public leftOp: string,
        public rightOp: string,
        public constant: bigInt.BigInteger,
        public isNegative: boolean
    ) {
        super();
    }

    exec(state: Simulation) {
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

export class Simulation {
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