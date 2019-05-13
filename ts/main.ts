import * as monaco from 'monaco-editor';
import * as parser from './parser';
import * as sim from './simulation';

declare const GoldenLayout: any;
declare const $: any;

const defaultProgram = `/*
  While Program Simulator

  "while" is a programming language consisting only of 3 basic operations:
    - Addition with a constant:
      x0 := x1 + 5;
    
    - Substraction with a constant:
      x0 := x1 - 5;
    
    - Loop until a variable is bigger than 0:
      WHILE (x0 > 0) DO
        // more code
      END

  Available variables are x0, x1, x2, ... and never go below 0.
*/

// Sample "multiplication"
// Click "Compile Code" on the right side to run.

x1 := x1 + 3; // Input (x1 = 3, x2 = 4)
x2 := x2 + 4; // Output will be x0 = x1 * x2 = 12

WHILE (x1 > 0) DO
  x3 := x2 + 0; // Temporary copy of x2
  WHILE (x3 > 0) DO
    x0 := x0 + 1; // Add x3 to x0, one by one
    x3 := x3 - 1;
  END;
  x1 := x1 - 1; 
END;

// The result is stored in x0`;

class EditorExtraData {
    simulation: sim.Simulation;
    decoration: string[] = [];
}

function getExtraData(model: monaco.editor.ITextModel): EditorExtraData {
    return ((model as any).__extra__ as EditorExtraData)
        || ((model as any).__extra__ = new EditorExtraData);
}

function initMonaco() {
    monaco.languages.register({ id: "while" });

    monaco.languages.setMonarchTokensProvider("while", {
        defaultToken: "invalid",
        brackets: [
            { open: "(", close: ")", token: "brackets.curly" },
        ],
        tokenizer: {
            root: [
                [/\(|\)/, "@brackets"],
                [/[wW][hH][iI][lL][eE]|[dD][oO]|[eE][nN][dD]/, "keyword"],
                [/\/\*/, 'comment', '@comment'],
                [/\/\/.*$/, "comment"],
                [/:=|[=>+-;]/, "operator"],
                [/[xX][1-9][0-9]*/, "number"],
                [/[xX]0/, "number"],
                [/[0-9]+/, "number.integer"],
            ],
            comment: [
                [/[^\/*]+/, 'comment'],
                [/\*\//, 'comment', '@pop'],
                [/[\/*]/, 'comment']
            ],
        },
    });

    monaco.languages.registerHoverProvider('while', { provideHover: provideHover });
};

function provideHover(model: monaco.editor.ITextModel, position: monaco.Position) {
    let line = model.getLineContent(position.lineNumber);
    let re = /[xX]\d+/g;
    let match: RegExpExecArray;
    const extraData = getExtraData(model);

    if (extraData && extraData.simulation) {
        while ((match = re.exec(line)) != null) {
            if (match.index <= position.column && match.length + match.index + 1 >= position.column) {
                return {
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    contents: [
                        { value: extraData.simulation.variables[match[0].toLowerCase()].toString() }
                    ]
                }
            }
        }
    }

    return null;
}

function initLayout() {
    const layout = new GoldenLayout({
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            popoutWholeStack: false,
            blockedPopoutsThrowError: true,
            closePopoutsOnUnload: true,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        content: [{
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'code',
                    componentState: { id: 'xd1' },
                    isClosable: false,
                },
                {
                    type: 'component',
                    componentName: 'debugger',
                    componentState: { id: 'xd1' },
                    title: "simulate",
                    isClosable: false,
                },
            ]
        }]
    });

    layout.registerComponent('code', createCodeView);
    layout.registerComponent('debugger', createDebugView);

    layout.init();
}

function createCodeView(container, state) {
    container.getElement().html(`<div id="${state.id}" style="width:100%;height:100%"></div>`);

    setTimeout(() => {
        const editor = monaco.editor.create(document.getElementById(state.id), {
            value: defaultProgram,
            language: 'while',
            automaticLayout: true,
            theme: "vs-dark",
            minimap: {
                enabled: false
            },
            glyphMargin: true
        });

        const editorState = new EditorState;
        editorState.editor = editor;
        editorState.id = state.id;

        handleTextChange(editorState);

        let isQueued = false;
        editor.getModel().onDidChangeContent(() => {
            if (!isQueued) {
                isQueued = true;
                setTimeout(() => {
                    isQueued = false;
                    handleTextChange(editorState);
                }, 300);
            }
        });
    }, 100);
}

function createDebugView(container, state) {
    container.getElement().html(`<div class='run'>
        <button id='run_${state.id}_reload'>Compile Code</button>
        <button disabled id='run_${state.id}_reset'>Reset Simulation</button>
        <button disabled id='run_${state.id}_run'>Run</button>
        <button disabled id='run_${state.id}_step'>Step</button>
        <div class='run_error' id='run_error_${state.id}'></div>
        <div id='run_vars_${state.id}'></div>
        <div class='run_finished' id='run_finished_${state.id}'></div>
        </div>`);
}

class EditorState {
    ast: sim.Ast;
    simulation: sim.Simulation;
    editor: monaco.editor.IStandaloneCodeEditor;
    id: string;
}

function handleTextChange(state: EditorState) {
    const extraData = getExtraData(state.editor.getModel());
    const newAst = parser.parse(state.editor.getModel().getValue());

    if (state.ast == null) {
        state.ast = newAst;
    }

    let { ast, simulation } = state;

    $("#run_" + state.id + "_reload")[0].disabled = false;
    $("#run_error_" + state.id).text(newAst.error || "");

    if (ast.error == null) {
        $("#run_" + state.id + "_reload").unbind("click");
        $("#run_" + state.id + "_reload").click(
            function () {
                extraData.simulation = state.simulation = simulation = new sim.Simulation(newAst);
                state.ast = ast = newAst;
                updateDebugView(state);
                $("#run_" + state.id + "_reload")[0].disabled = true;
            });

        $("#run_" + state.id + "_reset").unbind("click");
        $("#run_" + state.id + "_reset").click(
            function () {
                extraData.simulation = state.simulation = simulation = new sim.Simulation(ast);
                updateDebugView(state);
            });

        $("#run_" + state.id + "_step").unbind("click");
        $("#run_" + state.id + "_step").click(
            function () {
                if (simulation) {
                    simulation.step();
                }
                updateDebugView(state);
            });

        $("#run_" + state.id + "_run").unbind("click");
        $("#run_" + state.id + "_run").click(
            function () {
                if (simulation) {
                    simulation.run();
                }
                updateDebugView(state);
            });
    }
}

function updateDebugView(state: EditorState) {
    const { simulation: exec, editor, id } = state;
    const extraData = getExtraData(editor.getModel());

    if (!exec) {
        return;
    }

    $("#run_vars_" + id).html(
        (() => {
            let content = "Variables:<br><br>";
            for (const name in exec.variables) {
                content += `${name}: ${exec.variables[name]}<br>`;
            }
            return content;
        })());

    $("#run_finished_" + id).html(
        (() => {
            if (exec.finished) {
                return `Finished in ${exec.totalSteps} steps`;
            } else if (exec.didRun) {
                return `Did not finished in ${exec.totalSteps} steps. Press the run button again for more steps.`;
            } else {
                return "";
            }
        })());

    // marker at current code position
    extraData.decoration = exec.lineNr == null
        ? editor.deltaDecorations(extraData.decoration, [])
        : editor.deltaDecorations(extraData.decoration, [
            {
                range: new monaco.Range(exec.lineNr, 1, exec.lineNr, 1),
                options: {
                    isWholeLine: true,
                    className: 'myContentClass',
                    glyphMarginClassName: 'myGlyphMarginClass'
                }
            }
        ]);

    // misc
    $("#run_" + id + "_step")[0].disabled = exec.finished;
    $("#run_" + id + "_run")[0].disabled = exec.finished;
    $("#run_" + id + "_reset")[0].disabled = (exec.totalSteps == 0);
}

initMonaco();
initLayout();