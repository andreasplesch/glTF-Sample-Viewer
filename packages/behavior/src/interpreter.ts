import { nodes } from "./nodes/nodes";
import { NodeContext } from "./nodes/node-types";
import * as schema from "./schema";


export class Interpreter {
    public _state: {[type: string]: {[index: number]: {[socket: string]: any}}} = {};
    public _context: NodeContext = {};

    constructor(setCallback?: (jsonPointer: string, value: any) => void, getCallback?: (jsonPointer: string) => any)
    {
        this._context = {
            setCallback,
            getCallback
        }
    }

    public run(entryIndex: number, behaviorNodes: schema.Node[])
    {
        // Ensure no state can leak between individual runs
        this._state = {};

        // Evaluate the graph node by node
        let currentIndex: number | undefined = entryIndex;
        do {
            currentIndex = this.evalNode(currentIndex, behaviorNodes[currentIndex]);
        } while (currentIndex !== undefined)
    }

    private evalNode(index: number, node: schema.Node): number | undefined {
        const nodeTypeCategory = schema.extractTypeCategory(node.type);
        const nodeTypeName = schema.extractTypeName(node.type);
        if (! (nodeTypeCategory in nodes && nodeTypeName in nodes[nodeTypeCategory]) ) {
            throw new Error(`Unknown node ${node.type} encountered during evaluation of behavior`);
        }

        // Extract all references from the state, so that the nodes don't need to differntiate between
        // references and literal values
        const parameters: {[paramName: string]: any} = {};
        for (const [paramName, paramValue] of Object.entries(node.parameters || {})) {
            if (typeof paramValue === 'object' && "$node" in paramValue) {
                parameters[paramName] = this._state.$node[paramValue.$node][paramValue.socket];
                continue;
            } else {
                parameters[paramName] = paramValue;
            }
        }

        const output = nodes[nodeTypeCategory][nodeTypeName]({parameters, flow: node.flow}, this._context);
        this.makeState("$node", index);
        for (const [socketName, socketValue] of Object.entries(output.result)) {
            this._state.$node[index][socketName] = socketValue;
        }

        return output.nextFlow;
    }

    private makeState(type: string, index: number) {
        if (!(type in this._state)) {
            this._state[type] = {};
        }
        if (!(index in this._state[type])) {
            this._state[type][index] = {};
        }
    }
};