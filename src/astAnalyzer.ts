import * as vscode from 'vscode';
import * as ts from 'typescript';

export interface LineInfo {
    lineNumber: number;
    content: string;
    type: 'declaration' | 'assignment' | 'function-call' | 'control-flow' | 'return' | 'comment' | 'unknown';
    variables: string[];
    functions: string[];
    explanation: string;
}

export interface CodeContext {
    fileName: string;
    totalLines: number;
    currentScope: string[];
    declarations: Map<string, { type: string; line: number }>;
}

export class ASTAnalyzer {
    private sourceFile: ts.SourceFile | null = null;
    private context: CodeContext = {
        fileName: '',
        totalLines: 0,
        currentScope: [],
        declarations: new Map()
    };

    public analyzeDocument(document: vscode.TextDocument): void {
        this.context.fileName = document.fileName;
        this.context.totalLines = document.lineCount;

        // TypeScript/JavaScript 파일만 AST 분석
        const languageId = document.languageId;
        if (languageId === 'typescript' || languageId === 'javascript') {
            const sourceText = document.getText();
            this.sourceFile = ts.createSourceFile(
                document.fileName,
                sourceText,
                ts.ScriptTarget.Latest,
                true
            );

            this.buildDeclarationMap();
        }
    }

    public analyzeLineAt(document: vscode.TextDocument, lineNumber: number): LineInfo {
        const line = document.lineAt(lineNumber);
        const content = line.text.trim();

        if (!content || content.startsWith('//') || content.startsWith('/*')) {
            return {
                lineNumber,
                content,
                type: 'comment',
                variables: [],
                functions: [],
                explanation: this.explainComment(content)
            };
        }

        const analysis = this.analyzeLineContent(content, lineNumber);

        return {
            lineNumber,
            content,
            type: analysis.type,
            variables: analysis.variables,
            functions: analysis.functions,
            explanation: this.generateExplanation(analysis, content)
        };
    }

    private analyzeLineContent(content: string, lineNumber: number): {
        type: LineInfo['type'];
        variables: string[];
        functions: string[];
    } {
        const variables: string[] = [];
        const functions: string[] = [];
        let type: LineInfo['type'] = 'unknown';

        // Variable declarations
        if (content.match(/^(const|let|var)\s+/)) {
            type = 'declaration';
            const match = content.match(/^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
            if (match) {
                variables.push(match[2]);
                this.context.declarations.set(match[2], { type: match[1], line: lineNumber });
            }
        }
        // Function declarations
        else if (content.match(/^function\s+/) || content.match(/^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/)) {
            type = 'declaration';
            const match = content.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
            if (match) {
                const funcName = match[1] || match[2];
                if (funcName) {
                    functions.push(funcName);
                    this.context.declarations.set(funcName, { type: 'function', line: lineNumber });
                }
            }
        }
        // Assignments
        else if (content.includes('=') && !content.includes('==') && !content.includes('===')) {
            type = 'assignment';
            const match = content.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
            if (match) {
                variables.push(match[1]);
            }
        }
        // Function calls
        else if (content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/)) {
            type = 'function-call';
            const matches = content.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
            if (matches) {
                functions.push(...matches.map(m => m.replace(/\s*\(.*/, '')));
            }
        }
        // Control flow
        else if (content.match(/^(if|for|while|switch|try|catch|finally)\s*\(/)) {
            type = 'control-flow';
        }
        // Return statements
        else if (content.match(/^return\s+/)) {
            type = 'return';
        }

        return { type, variables, functions };
    }

    private generateExplanation(analysis: {
        type: LineInfo['type'];
        variables: string[];
        functions: string[];
    }, content: string): string {
        switch (analysis.type) {
            case 'declaration':
                if (analysis.variables.length > 0) {
                    const variable = analysis.variables[0];
                    if (content.includes('const')) {
                        return `상수 '${variable}'를 선언하고 값을 할당합니다.`;
                    } else if (content.includes('let')) {
                        return `변수 '${variable}'를 선언합니다. (블록 스코프)`;
                    } else if (content.includes('var')) {
                        return `변수 '${variable}'를 선언합니다. (함수 스코프)`;
                    }
                }
                if (analysis.functions.length > 0) {
                    const funcName = analysis.functions[0];
                    return `함수 '${funcName}'를 정의합니다.`;
                }
                break;

            case 'assignment':
                if (analysis.variables.length > 0) {
                    const variable = analysis.variables[0];
                    return `변수 '${variable}'에 새로운 값을 할당합니다.`;
                }
                break;

            case 'function-call':
                if (analysis.functions.length > 0) {
                    const funcName = analysis.functions[0];
                    return `함수 '${funcName}'를 호출합니다.`;
                }
                break;

            case 'control-flow':
                if (content.startsWith('if')) {
                    return '조건문을 시작합니다. 조건이 참일 때 내부 코드를 실행합니다.';
                } else if (content.startsWith('for')) {
                    return '반복문을 시작합니다. 지정된 조건까지 코드를 반복 실행합니다.';
                } else if (content.startsWith('while')) {
                    return '조건부 반복문을 시작합니다. 조건이 참인 동안 코드를 반복 실행합니다.';
                }
                break;

            case 'return':
                return '함수에서 값을 반환하고 실행을 종료합니다.';

            case 'comment':
                return '주석입니다. 코드에 대한 설명이나 메모를 제공합니다.';
        }

        return '코드를 실행합니다.';
    }

    private explainComment(content: string): string {
        if (content.startsWith('//')) {
            return '단일 줄 주석입니다.';
        } else if (content.startsWith('/*')) {
            return '다중 줄 주석입니다.';
        }
        return '주석입니다.';
    }

    private buildDeclarationMap(): void {
        if (!this.sourceFile) {
            return;
        }

        const visit = (node: ts.Node) => {
            if (ts.isVariableDeclaration(node) && node.name) {
                const name = node.name.getText();
                const line = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart()).line;
                this.context.declarations.set(name, { type: 'variable', line });
            } else if (ts.isFunctionDeclaration(node) && node.name) {
                const name = node.name.getText();
                const line = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart()).line;
                this.context.declarations.set(name, { type: 'function', line });
            }

            ts.forEachChild(node, visit);
        };

        visit(this.sourceFile);
    }

    public getContext(): CodeContext {
        return { ...this.context };
    }

    public getDeclarationInfo(name: string): { type: string; line: number } | undefined {
        return this.context.declarations.get(name);
    }
}