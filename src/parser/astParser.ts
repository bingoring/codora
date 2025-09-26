import * as ts from 'typescript';
import * as vscode from 'vscode';

export interface ASTNodeInfo {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    kind: ts.SyntaxKind;
    kindName: string;
    text: string;
    parent?: ASTNodeInfo;
    children: ASTNodeInfo[];
    depth: number;
}

export interface LineContext {
    lineNumber: number;
    lineText: string;
    nodes: ASTNodeInfo[];
    variables: VariableInfo[];
    functions: FunctionInfo[];
    imports: ImportInfo[];
    scope: ScopeInfo;
    indentLevel: number;
}

export interface VariableInfo {
    name: string;
    type: string;
    line: number;
    kind: 'const' | 'let' | 'var' | 'parameter' | 'property';
    scope: string;
}

export interface FunctionInfo {
    name: string;
    parameters: string[];
    returnType: string;
    line: number;
    isAsync: boolean;
    isArrow: boolean;
}

export interface ImportInfo {
    module: string;
    imports: string[];
    line: number;
    isDefault: boolean;
    isNamespace: boolean;
}

export interface ScopeInfo {
    type: 'global' | 'function' | 'class' | 'block' | 'module';
    name?: string;
    parentScope?: ScopeInfo;
    variables: string[];
    functions: string[];
}

export class ASTParser {
    private sourceFile: ts.SourceFile | null = null;
    private document: vscode.TextDocument | null = null;
    private lineContextCache: Map<number, LineContext> = new Map();

    public async parseDocument(document: vscode.TextDocument): Promise<void> {
        this.document = document;
        this.lineContextCache.clear();

        const sourceText = document.getText();

        // Create TypeScript source file
        this.sourceFile = ts.createSourceFile(
            document.fileName,
            sourceText,
            ts.ScriptTarget.Latest,
            true,
            this.getScriptKind(document.languageId)
        );

        // Pre-compute line contexts for better performance
        this.buildLineContexts();
    }

    private getScriptKind(languageId: string): ts.ScriptKind {
        switch (languageId) {
            case 'typescript': return ts.ScriptKind.TS;
            case 'javascript': return ts.ScriptKind.JS;
            case 'typescriptreact': return ts.ScriptKind.TSX;
            case 'javascriptreact': return ts.ScriptKind.JSX;
            default: return ts.ScriptKind.TS;
        }
    }

    private buildLineContexts(): void {
        if (!this.sourceFile || !this.document) {
            return;
        }

        const sourceFile = this.sourceFile;
        const document = this.document;

        // Visit all nodes and build line contexts
        const visitNode = (node: ts.Node, depth: number = 0, scope: ScopeInfo = this.createGlobalScope()) => {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

            const nodeInfo: ASTNodeInfo = {
                line: pos.line,
                column: pos.character,
                endLine: end.line,
                endColumn: end.character,
                kind: node.kind,
                kindName: ts.SyntaxKind[node.kind],
                text: node.getText(sourceFile),
                children: [],
                depth
            };

            // Add node to line context
            for (let lineNum = pos.line; lineNum <= end.line; lineNum++) {
                if (!this.lineContextCache.has(lineNum)) {
                    const lineText = document.lineAt(lineNum).text;
                    this.lineContextCache.set(lineNum, {
                        lineNumber: lineNum,
                        lineText,
                        nodes: [],
                        variables: [],
                        functions: [],
                        imports: [],
                        scope: { ...scope },
                        indentLevel: this.getIndentLevel(lineText)
                    });
                }

                this.lineContextCache.get(lineNum)!.nodes.push(nodeInfo);
            }

            // Extract specific information based on node type
            this.extractNodeInformation(node, scope);

            // Create new scope for function/class/block
            const newScope = this.createChildScope(node, scope);

            // Visit children with updated scope
            ts.forEachChild(node, child => {
                visitNode(child, depth + 1, newScope);
            });
        };

        visitNode(sourceFile);
        this.postProcessLineContexts();
    }

    private createGlobalScope(): ScopeInfo {
        return {
            type: 'global',
            variables: [],
            functions: []
        };
    }

    private createChildScope(node: ts.Node, parentScope: ScopeInfo): ScopeInfo {
        let scopeType: ScopeInfo['type'] = parentScope.type;
        let scopeName: string | undefined;

        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
            scopeType = 'function';
            scopeName = ts.isFunctionDeclaration(node) ? node.name?.text : 'anonymous';
        } else if (ts.isClassDeclaration(node)) {
            scopeType = 'class';
            scopeName = node.name?.text;
        } else if (ts.isBlock(node)) {
            scopeType = 'block';
        } else if (ts.isModuleDeclaration(node)) {
            scopeType = 'module';
            scopeName = node.name.getText();
        }

        if (scopeType !== parentScope.type || scopeName) {
            return {
                type: scopeType,
                name: scopeName,
                parentScope,
                variables: [],
                functions: []
            };
        }

        return parentScope;
    }

    private extractNodeInformation(node: ts.Node, scope: ScopeInfo): void {
        if (!this.sourceFile) {return;}

        const pos = this.sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const lineNum = pos.line;
        const context = this.lineContextCache.get(lineNum);

        if (!context) {return;}

        // Extract variable declarations
        if (ts.isVariableDeclaration(node)) {
            const varInfo: VariableInfo = {
                name: node.name.getText(this.sourceFile),
                type: node.type ? node.type.getText(this.sourceFile) : 'any',
                line: lineNum,
                kind: this.getVariableKind(node),
                scope: scope.name || scope.type
            };
            context.variables.push(varInfo);
            scope.variables.push(varInfo.name);
        }

        // Extract function declarations
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
            const funcInfo: FunctionInfo = {
                name: ts.isFunctionDeclaration(node) ? node.name?.text || 'anonymous' : 'anonymous',
                parameters: node.parameters.map(p => p.name.getText(this.sourceFile!)),
                returnType: node.type ? node.type.getText(this.sourceFile) : 'void',
                line: lineNum,
                isAsync: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
                isArrow: ts.isArrowFunction(node)
            };
            context.functions.push(funcInfo);
            scope.functions.push(funcInfo.name);
        }

        // Extract import statements
        if (ts.isImportDeclaration(node)) {
            const importClause = node.importClause;
            const moduleSpecifier = node.moduleSpecifier.getText(this.sourceFile).slice(1, -1); // Remove quotes

            if (importClause) {
                const importInfo: ImportInfo = {
                    module: moduleSpecifier,
                    imports: [],
                    line: lineNum,
                    isDefault: false,
                    isNamespace: false
                };

                if (importClause.name) {
                    importInfo.imports.push(importClause.name.text);
                    importInfo.isDefault = true;
                }

                if (importClause.namedBindings) {
                    if (ts.isNamespaceImport(importClause.namedBindings)) {
                        importInfo.imports.push(importClause.namedBindings.name.text);
                        importInfo.isNamespace = true;
                    } else if (ts.isNamedImports(importClause.namedBindings)) {
                        importInfo.imports.push(
                            ...importClause.namedBindings.elements.map(e => e.name.text)
                        );
                    }
                }

                context.imports.push(importInfo);
            }
        }
    }

    private getVariableKind(node: ts.VariableDeclaration): VariableInfo['kind'] {
        const parent = node.parent;
        if (ts.isVariableDeclarationList(parent)) {
            if (parent.flags & ts.NodeFlags.Const) {return 'const';}
            if (parent.flags & ts.NodeFlags.Let) {return 'let';}
            return 'var';
        }
        return 'var';
    }

    private getIndentLevel(lineText: string): number {
        let indentLevel = 0;
        for (const char of lineText) {
            if (char === ' ') {
                indentLevel++;
            } else if (char === '\t') {
                indentLevel += 4; // Assume 4 spaces per tab
            } else {
                break;
            }
        }
        return Math.floor(indentLevel / 4); // Convert to logical indent levels
    }

    private postProcessLineContexts(): void {
        // Sort nodes by position for each line
        this.lineContextCache.forEach(context => {
            context.nodes.sort((a, b) => a.column - b.column);
        });
    }

    public getLineContext(lineNumber: number): LineContext | null {
        return this.lineContextCache.get(lineNumber) || null;
    }

    public getAllLineContexts(): LineContext[] {
        return Array.from(this.lineContextCache.values()).sort((a, b) => a.lineNumber - b.lineNumber);
    }

    public getNodesAtLine(lineNumber: number): ASTNodeInfo[] {
        const context = this.lineContextCache.get(lineNumber);
        return context ? context.nodes : [];
    }

    public getVariablesInScope(lineNumber: number): VariableInfo[] {
        const context = this.lineContextCache.get(lineNumber);
        if (!context) {return [];}

        const variables: VariableInfo[] = [];
        let currentScope: ScopeInfo | undefined = context.scope;

        while (currentScope) {
            // Find variables declared in this scope before the current line
            this.lineContextCache.forEach((lineContext, lineNum) => {
                if (lineNum < lineNumber && lineContext.scope === currentScope) {
                    variables.push(...lineContext.variables);
                }
            });
            currentScope = currentScope.parentScope;
        }

        return variables;
    }

    public getFunctionAtLine(lineNumber: number): FunctionInfo | null {
        const context = this.lineContextCache.get(lineNumber);
        if (!context || context.functions.length === 0) {
            return null;
        }
        return context.functions[0]; // Return first function on the line
    }

    public isInFunctionBody(lineNumber: number): boolean {
        const context = this.lineContextCache.get(lineNumber);
        if (!context) {return false;}

        return context.nodes.some(node =>
            node.kindName === 'Block' ||
            node.kindName === 'FunctionExpression' ||
            node.kindName === 'ArrowFunction'
        );
    }

    public getContainingFunction(lineNumber: number): FunctionInfo | null {
        // Look backwards to find the function that contains this line
        for (let line = lineNumber; line >= 0; line--) {
            const context = this.lineContextCache.get(line);
            if (context && context.functions.length > 0) {
                const func = context.functions[0];
                // Check if the current line is within the function's scope
                if (this.isLineInFunctionScope(lineNumber, func)) {
                    return func;
                }
            }
        }
        return null;
    }

    private isLineInFunctionScope(lineNumber: number, func: FunctionInfo): boolean {
        // Simple heuristic: check if the line is after the function declaration
        // and has higher indent level (more sophisticated logic could be added)
        const funcContext = this.lineContextCache.get(func.line);
        const lineContext = this.lineContextCache.get(lineNumber);

        if (!funcContext || !lineContext) {return false;}

        return lineNumber > func.line && lineContext.indentLevel > funcContext.indentLevel;
    }
}