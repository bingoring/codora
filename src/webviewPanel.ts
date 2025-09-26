import * as vscode from 'vscode';
import { SemanticBlock } from './semantic/SemanticBlockAnalyzer';
import { AIPoweredAnalyzer } from './ai/AIPoweredAnalyzer';
import { AIManager } from './ai/AIManager';
import { CrossFileContext } from './crossfile/CrossFileAnalyzer';

export class CodoraWebviewPanel {
    private static currentPanel: CodoraWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private aiPoweredAnalyzer?: AIPoweredAnalyzer;
    private aiManager?: AIManager;

    constructor(private context: vscode.ExtensionContext) {
        this.panel = vscode.window.createWebviewPanel(
            'codora',
            '🗺️ Codora Explorer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        this.setupWebview();
        this.setupEventListeners();
    }

    public static getInstance(context: vscode.ExtensionContext): CodoraWebviewPanel {
        // Check if current panel exists and is still valid
        if (!CodoraWebviewPanel.currentPanel || !CodoraWebviewPanel.currentPanel.panel) {
            console.log('🗺️ Creating new webview panel instance...');
            CodoraWebviewPanel.currentPanel = new CodoraWebviewPanel(context);
        } else {
            console.log('🗺️ Reusing existing webview panel instance...');
        }
        return CodoraWebviewPanel.currentPanel;
    }

    public static createNewInstance(context: vscode.ExtensionContext): CodoraWebviewPanel {
        // Force create a new instance even if one exists
        if (CodoraWebviewPanel.currentPanel) {
            CodoraWebviewPanel.currentPanel.dispose();
        }
        CodoraWebviewPanel.currentPanel = new CodoraWebviewPanel(context);
        return CodoraWebviewPanel.currentPanel;
    }

    public setAIPoweredAnalyzer(analyzer: AIPoweredAnalyzer): void {
        this.aiPoweredAnalyzer = analyzer;
    }

    public setAIManager(aiManager: AIManager): void {
        this.aiManager = aiManager;
    }

    private setupWebview() {
        this.panel.webview.html = this.getWebviewContent();
    }

    private setupEventListeners() {
        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'startExploration':
                        this.handleStartExploration(message.data);
                        break;
                    case 'nextLine':
                        this.handleNextLine();
                        break;
                    case 'previousLine':
                        this.handlePreviousLine();
                        break;
                    case 'jumpToLine':
                        this.handleJumpToLine(message.line);
                        break;
                }
            },
            null,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            CodoraWebviewPanel.currentPanel = undefined;
            // Clean up disposables without calling dispose() again to avoid circular call
            while (this.disposables.length) {
                const disposable = this.disposables.pop();
                if (disposable) {
                    disposable.dispose();
                }
            }
        }, null, this.disposables);
    }

    public showGuidePanel(document: vscode.TextDocument, position: vscode.Position) {
        try {
            // Ensure webview is visible first
            this.panel.reveal(vscode.ViewColumn.Beside);

            // Send initial data to webview
            this.panel.webview.postMessage({
                command: 'initialize',
                data: {
                    fileName: document.fileName,
                    position: {
                        line: position.line,
                        character: position.character
                    },
                    totalLines: document.lineCount
                }
            });

            // Show welcome message
            this.showWelcomeContent(document, position);
        } catch (error) {
            console.error('Error showing guide panel:', error);
            vscode.window.showErrorMessage(`Failed to show Codora panel: ${error}`);
        }
    }

    private showWelcomeContent(document: vscode.TextDocument, position: vscode.Position) {
        const line = document.lineAt(position.line);
        const content = {
            currentLine: position.line + 1,
            totalLines: document.lineCount,
            code: line.text,
            explanation: "Welcome to CodeGuide AI! This is where line-by-line explanations will appear.",
            fileName: document.fileName.split('/').pop() || 'Unknown file'
        };

        this.panel.webview.postMessage({
            command: 'updateContent',
            data: content
        });
    }

    private handleStartExploration(data: any) {
        vscode.window.showInformationMessage(`🗺️ Starting exploration for: ${data.symbolName}`);
    }

    private currentDocument: vscode.TextDocument | null = null;
    private currentLine = 0;

    private async handleNextLine() {
        if (!this.currentDocument) {
            return;
        }

        if (this.currentLine < this.currentDocument.lineCount - 1) {
            this.currentLine++;
            await this.updateLineExplanation();
        } else {
            vscode.window.showInformationMessage('마지막 라인에 도달했습니다.');
        }
    }

    private async handlePreviousLine() {
        if (!this.currentDocument) {
            return;
        }

        if (this.currentLine > 0) {
            this.currentLine--;
            await this.updateLineExplanation();
        } else {
            vscode.window.showInformationMessage('첫 번째 라인입니다.');
        }
    }

    private async updateLineExplanation() {
        if (!this.currentDocument) {
            return;
        }

        // Use AI-powered analysis instead of AST analyzer
        const lineInfo = await this.getAIPoweredLineAnalysis(this.currentDocument, this.currentLine);

        // Update editor selection
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === this.currentDocument) {
            const position = new vscode.Position(this.currentLine, 0);
            const lineEnd = new vscode.Position(this.currentLine, lineInfo.content.length);
            editor.selection = new vscode.Selection(position, lineEnd);
            editor.revealRange(new vscode.Range(position, lineEnd));
        }

        // Update webview content
        this.panel.webview.postMessage({
            command: 'updateContent',
            data: {
                currentLine: this.currentLine + 1,
                totalLines: this.currentDocument.lineCount,
                code: lineInfo.content,
                explanation: lineInfo.explanation,
                type: lineInfo.type,
                variables: lineInfo.variables,
                functions: lineInfo.functions,
                fileName: this.currentDocument.fileName.split('/').pop() || 'Unknown file'
            }
        });
    }

    public async startLineByLineExploration(document: vscode.TextDocument, startLine: number = 0) {
        try {
            console.log('🗺️ Starting line-by-line exploration...'); // Debug log

            // Ensure webview is visible FIRST
            this.revealWebview();

            // All analysis is now AI-powered - no need for AST analyzer
            console.log('🗺️ Using AI-powered code analysis');

            this.currentDocument = document;
            this.currentLine = startLine;

            // Show initial content
            await this.updateLineExplanationSafe();

            console.log('🗺️ Line-by-line exploration started successfully'); // Debug log
        } catch (error) {
            console.error('Error in startLineByLineExploration:', error);
            vscode.window.showErrorMessage(`Failed to start exploration: ${error}`);
        }
    }

    private revealWebview() {
        try {
            console.log('🗺️ Attempting to reveal webview...');

            // Check if panel is still valid
            if (!this.panel) {
                console.error('Panel is null or undefined');
                throw new Error('Webview panel is not initialized');
            }

            // Try different view columns
            try {
                this.panel.reveal(vscode.ViewColumn.Beside, false);
                console.log('🗺️ Webview revealed in Beside column');
            } catch (besideError) {
                console.warn('Failed to reveal beside:', besideError);
                try {
                    this.panel.reveal(vscode.ViewColumn.Two, false);
                    console.log('🗺️ Webview revealed in Two column');
                } catch (twoError) {
                    console.warn('Failed to reveal in column Two:', twoError);
                    this.panel.reveal(vscode.ViewColumn.One, false);
                    console.log('🗺️ Webview revealed in One column');
                }
            }
        } catch (error) {
            console.error('Complete failure to reveal webview:', error);
            throw new Error(`Unable to show webview panel: ${error}`);
        }
    }

    private async updateLineExplanationSafe() {
        if (!this.currentDocument) {
            return;
        }

        try {
            // Use AI-powered analysis for all line explanations
            const lineInfo = await this.getAIPoweredLineAnalysis(this.currentDocument, this.currentLine);

            // Update editor selection
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === this.currentDocument) {
                const position = new vscode.Position(this.currentLine, 0);
                const lineEnd = new vscode.Position(this.currentLine, lineInfo.content.length);
                editor.selection = new vscode.Selection(position, lineEnd);
                editor.revealRange(new vscode.Range(position, lineEnd));
            }

            // Update webview content
            this.panel.webview.postMessage({
                command: 'updateContent',
                data: {
                    currentLine: this.currentLine + 1,
                    totalLines: this.currentDocument.lineCount,
                    code: lineInfo.content,
                    explanation: lineInfo.explanation,
                    type: lineInfo.type || 'unknown',
                    variables: lineInfo.variables || [],
                    functions: lineInfo.functions || [],
                    fileName: this.currentDocument.fileName.split('/').pop() || 'Unknown file'
                }
            });
        } catch (error) {
            console.error('Error updating line explanation:', error);
            vscode.window.showErrorMessage(`Error updating explanation: ${error}`);
        }
    }

    /**
     * AI-powered line analysis to replace AST analyzer functionality
     */
    private async getAIPoweredLineAnalysis(document: vscode.TextDocument, lineNumber: number): Promise<{
        content: string;
        explanation: string;
        type: string;
        variables: string[];
        functions: string[];
    }> {
        const line = document.lineAt(lineNumber);
        const content = line.text.trim();

        if (!content || content.startsWith('//') || content.startsWith('/*')) {
            return {
                content: line.text,
                explanation: 'Comment or empty line',
                type: 'comment',
                variables: [],
                functions: []
            };
        }

        try {
            // Get surrounding context for better AI analysis
            const contextLines = 3;
            const startLine = Math.max(0, lineNumber - contextLines);
            const endLine = Math.min(document.lineCount - 1, lineNumber + contextLines);

            const contextCode = [];
            for (let i = startLine; i <= endLine; i++) {
                const prefix = i === lineNumber ? '>>> ' : '    ';
                contextCode.push(`${prefix}${document.lineAt(i).text}`);
            }

            const context = contextCode.join('\n');
            const language = document.languageId;

            if (this.aiManager) {
                const explanation = await this.aiManager.generateExplanation(
                    content,
                    `Line analysis for line ${lineNumber + 1} in ${document.fileName.split('/').pop()}\nContext:\n${context}`,
                    language
                );

                return {
                    content: line.text,
                    explanation: explanation,
                    type: this.inferLineType(content),
                    variables: this.extractVariables(content),
                    functions: this.extractFunctions(content)
                };
            } else {
                // Fallback without AI
                return {
                    content: line.text,
                    explanation: `Line ${lineNumber + 1}: ${this.getBasicExplanation(content)}`,
                    type: this.inferLineType(content),
                    variables: this.extractVariables(content),
                    functions: this.extractFunctions(content)
                };
            }
        } catch (error) {
            console.warn('AI analysis failed, using basic analysis:', error);
            return {
                content: line.text,
                explanation: `Line ${lineNumber + 1}: ${this.getBasicExplanation(content)}`,
                type: this.inferLineType(content),
                variables: this.extractVariables(content),
                functions: this.extractFunctions(content)
            };
        }
    }

    private inferLineType(content: string): string {
        if (content.match(/^(const|let|var)\s+/)) {
            return 'declaration';
        } else if (content.match(/^function\s+/) || content.match(/^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/)) {
            return 'declaration';
        } else if (content.includes('=') && !content.includes('==') && !content.includes('===')) {
            return 'assignment';
        } else if (content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/)) {
            return 'function-call';
        } else if (content.match(/^(if|for|while|switch|try|catch|finally)\s*\(/)) {
            return 'control-flow';
        } else if (content.match(/^return\s+/)) {
            return 'return';
        } else if (content.startsWith('//') || content.startsWith('/*')) {
            return 'comment';
        } else {
            return 'unknown';
        }
    }

    private extractVariables(content: string): string[] {
        const variables: string[] = [];

        // Variable declarations
        const declMatch = content.match(/^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (declMatch) {
            variables.push(declMatch[2]);
        }

        // Assignments
        const assignMatch = content.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
        if (assignMatch) {
            variables.push(assignMatch[1]);
        }

        return variables;
    }

    private extractFunctions(content: string): string[] {
        const functions: string[] = [];

        // Function declarations
        const funcDeclMatch = content.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
        if (funcDeclMatch) {
            const funcName = funcDeclMatch[1] || funcDeclMatch[2];
            if (funcName) {
                functions.push(funcName);
            }
        }

        // Function calls
        const callMatches = content.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
        if (callMatches) {
            callMatches.forEach(match => {
                const funcName = match.replace(/\s*\(.*/, '');
                if (!functions.includes(funcName)) {
                    functions.push(funcName);
                }
            });
        }

        return functions;
    }

    private getBasicExplanation(content: string): string {
        const type = this.inferLineType(content);

        switch (type) {
            case 'declaration':
                if (content.includes('const')) {
                    return 'Declares a constant variable';
                } else if (content.includes('let')) {
                    return 'Declares a block-scoped variable';
                } else if (content.includes('var')) {
                    return 'Declares a function-scoped variable';
                } else if (content.includes('function')) {
                    return 'Defines a function';
                }
                return 'Declares something';
            case 'assignment':
                return 'Assigns a value to a variable';
            case 'function-call':
                return 'Calls a function';
            case 'control-flow':
                if (content.startsWith('if')) {
                    return 'Conditional statement';
                } else if (content.startsWith('for') || content.startsWith('while')) {
                    return 'Loop statement';
                }
                return 'Control flow statement';
            case 'return':
                return 'Returns a value from function';
            case 'comment':
                return 'Code comment';
            default:
                return 'Executes code';
        }
    }

    private handleJumpToLine(line: number) {
        // Jump to specific line in active editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        }
    }

    public isVisible(): boolean {
        return this.panel.visible;
    }

    public focusWebview() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🗺️ Codora Explorer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
        }

        .header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }

        .progress {
            margin-left: auto;
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .content {
            margin-bottom: 20px;
        }

        .explanation {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 15px;
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            margin: 15px 0;
        }

        .code-section {
            margin: 15px 0;
        }

        .code-label {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
            text-transform: uppercase;
        }

        .code-content {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            overflow-x: auto;
        }

        .controls {
            display: flex;
            gap: 10px;
            justify-content: space-between;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .control-group {
            display: flex;
            gap: 10px;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .welcome {
            text-align: center;
            margin: 40px 0;
            color: var(--vscode-descriptionForeground);
        }

        .welcome-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }

        .status {
            background-color: var(--vscode-inputValidation-infoBorder);
            color: var(--vscode-inputValidation-infoBackground);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 15px;
        }

        .debug-info {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 15px;
            font-family: monospace;
        }

        /* Block Analysis Styles */
        .block-analysis {
            padding: 20px 0;
        }

        .block-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        .block-header h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }

        .block-badges {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-low {
            background-color: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
        }

        .badge-medium {
            background-color: rgba(255, 193, 7, 0.2);
            color: #FFC107;
        }

        .badge-high {
            background-color: rgba(244, 67, 54, 0.2);
            color: #F44336;
        }

        .badge-business {
            background-color: rgba(156, 39, 176, 0.2);
            color: #9C27B0;
        }

        .badge-external {
            background-color: rgba(33, 150, 243, 0.2);
            color: #2196F3;
        }

        .block-purpose,
        .block-parameters,
        .block-return,
        .block-dependencies,
        .block-code,
        .block-context {
            margin-bottom: 25px;
        }

        .block-purpose h3,
        .block-parameters h3,
        .block-return h3,
        .block-dependencies h3,
        .block-code h3,
        .block-context h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .block-purpose p {
            font-size: 15px;
            line-height: 1.6;
            background-color: var(--vscode-textBlockQuote-background);
            padding: 12px;
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            margin: 0;
        }

        .block-parameters ul,
        .block-dependencies ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .block-parameters li,
        .block-dependencies li {
            padding: 6px 12px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            margin-bottom: 6px;
            font-family: 'Courier New', monospace;
        }

        .block-return p {
            background-color: var(--vscode-input-background);
            padding: 8px 12px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            margin: 0;
        }

        .block-code pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 0;
        }

        .block-code code {
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
        }

        .block-context p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        /* Cross-File Analysis Styles */
        .cross-file-analysis {
            padding: 20px 0;
        }

        .analysis-header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        .source-block h2 {
            margin: 0 0 15px 0;
            font-size: 26px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .block-meta {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 10px;
        }

        .file-name {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .purpose {
            font-size: 16px;
            color: var(--vscode-descriptionForeground);
            margin: 10px 0 0 0;
        }

        .analysis-sections {
            margin-bottom: 30px;
        }

        .analysis-section {
            margin-bottom: 40px;
        }

        .analysis-section h3 {
            margin: 0 0 20px 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-foreground);
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .related-files-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 15px;
        }

        .file-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
            transition: all 0.3s ease;
        }

        .file-card:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .file-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .file-icon {
            font-size: 18px;
            margin-right: 8px;
        }

        .confidence {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }

        .relationship-type {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .business-connection {
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 12px;
        }

        .relevant-blocks {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .block-tag {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .data-flows {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .data-flow {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
        }

        .flow-path {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .flow-arrow {
            font-size: 16px;
        }

        .flow-details {
            display: flex;
            gap: 15px;
            margin-bottom: 8px;
        }

        .data-type, .transformation {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
        }

        .flow-purpose {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .business-flow h4 {
            margin: 0 0 15px 0;
            font-size: 18px;
            font-weight: 600;
        }

        .involved-files, .flow-steps, .decision-points {
            margin-bottom: 15px;
        }

        .file-chip {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-right: 8px;
            margin-bottom: 4px;
            display: inline-block;
        }

        .navigation-trail {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .nav-step {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            padding: 12px;
            background-color: var(--vscode-input-background);
            border-radius: 8px;
            border: 1px solid var(--vscode-input-border);
        }

        .nav-step.current {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-textBlockQuote-background);
        }

        .nav-number {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .nav-details {
            flex-grow: 1;
        }

        .nav-target {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .nav-reason {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .nav-time {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.8;
        }

        .analysis-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .timestamp {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .refresh-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .refresh-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* Relationship-specific colors */
        .relationship-imports_from {
            border-left: 4px solid #4CAF50;
        }

        .relationship-exports_to {
            border-left: 4px solid #2196F3;
        }

        .relationship-calls_function {
            border-left: 4px solid #FF9800;
        }

        .relationship-shares_type {
            border-left: 4px solid #9C27B0;
        }

        .relationship-extends_class {
            border-left: 4px solid #E91E63;
        }

        .relationship-implements_interface {
            border-left: 4px solid #607D8B;
        }

        /* Flow direction indicators */
        .flow-input {
            border-left: 4px solid #4CAF50;
        }

        .flow-output {
            border-left: 4px solid #2196F3;
        }

        .flow-bidirectional {
            border-left: 4px solid #FF9800;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">🗺️ Codora Explorer</h1>
        <div class="progress" id="progress">Ready to start</div>
    </div>

    <div class="status" id="status">
        Hover over functions, classes, or methods in your code to see exploration options
    </div>

    <div class="debug-info" id="debug-info">
        Webview loaded successfully ✓
    </div>

    <div class="content" id="content">
        <div class="welcome">
            <div class="welcome-icon">🗺️</div>
            <h3>Welcome to Codora!</h3>
            <p>Your code exploration companion - Like Dora, but for code!</p>
            <p>Phase 1 Features Available:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>✅ Hover over code symbols to see exploration options</li>
                <li>✅ Interactive webview panel</li>
                <li>✅ Symbol detection and extraction</li>
                <li>🚧 Line-by-line explanations (Phase 2)</li>
                <li>🚧 AI-powered descriptions (Phase 4)</li>
            </ul>
        </div>
    </div>

    <div class="controls">
        <div class="control-group">
            <button id="prevBtn" disabled onclick="previousLine()">⬅️ Previous</button>
            <button id="nextBtn" disabled onclick="nextLine()">➡️ Next</button>
        </div>
        <div class="control-group">
            <button onclick="jumpToCurrentLine()">🎯 Jump to Line</button>
            <button onclick="showFlowChart()">📊 Flow Chart</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentData = null;

        console.log('🗺️ Codora webview script loaded');

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('🗺️ Webview received message:', message.command);

            switch (message.command) {
                case 'initialize':
                    handleInitialize(message.data);
                    break;
                case 'updateContent':
                    handleUpdateContent(message.data);
                    break;
                case 'showBlockAnalysis':
                    handleBlockAnalysis(message.data);
                    break;
                case 'showCrossFileAnalysis':
                    handleCrossFileAnalysis(message.data);
                    break;
            }
        });

        function handleInitialize(data) {
            console.log('🗺️ Initializing webview with data:', data);
            currentData = data;
            document.getElementById('progress').textContent =
                \`\${data.fileName} - Line \${data.position.line + 1}/\${data.totalLines}\`;
            document.getElementById('status').textContent =
                'Guide initialized! Ready to explore code.';
            document.getElementById('debug-info').innerHTML =
                \`Initialized: \${data.fileName} at line \${data.position.line + 1}\`;
        }

        function handleUpdateContent(data) {
            console.log('🗺️ Updating content with data:', data);
            currentData = data;

            const content = document.getElementById('content');
            content.innerHTML = \`
                <div class="explanation">
                    <strong>💡 Current Explanation:</strong><br>
                    \${data.explanation}
                </div>

                <div class="code-section">
                    <div class="code-label">📝 Code (Line \${data.currentLine}):</div>
                    <div class="code-content">\${escapeHtml(data.code)}</div>
                </div>
            \`;

            document.getElementById('progress').textContent =
                \`Line \${data.currentLine}/\${data.totalLines}\`;

            // Enable/disable navigation buttons
            document.getElementById('prevBtn').disabled = data.currentLine <= 1;
            document.getElementById('nextBtn').disabled = data.currentLine >= data.totalLines;

            document.getElementById('debug-info').innerHTML =
                \`Updated: Line \${data.currentLine}, Type: \${data.type || 'unknown'}\`;
        }

        function previousLine() {
            console.log('🗺️ Previous line requested');
            vscode.postMessage({
                command: 'previousLine'
            });
        }

        function nextLine() {
            console.log('🗺️ Next line requested');
            vscode.postMessage({
                command: 'nextLine'
            });
        }

        function jumpToCurrentLine() {
            if (currentData) {
                console.log('🗺️ Jump to line requested:', currentData.currentLine);
                vscode.postMessage({
                    command: 'jumpToLine',
                    line: currentData.currentLine
                });
            }
        }

        function showFlowChart() {
            console.log('🗺️ Flow chart requested');
            vscode.postMessage({
                command: 'showFlowChart'
            });
        }

        function handleBlockAnalysis(data) {
            console.log('🗺️ Handling block analysis:', data);

            const block = data.block;
            const content = document.getElementById('content');

            content.innerHTML = \`
                <div class="block-analysis">
                    <div class="block-header">
                        <h2>\${getBlockIcon(block.type)} \${block.name}</h2>
                        <div class="block-badges">
                            <span class="badge badge-\${block.complexity}">\${block.complexity}</span>
                            <span class="badge badge-\${block.importance}">\${block.importance}</span>
                            \${block.businessLogic ? '<span class="badge badge-business">💼 Business Logic</span>' : ''}
                            \${block.hasExternalDependencies ? '<span class="badge badge-external">🌐 External</span>' : ''}
                        </div>
                    </div>

                    <div class="block-purpose">
                        <h3>🎯 Purpose</h3>
                        <p>\${block.purpose}</p>
                    </div>

                    \${block.parameters.length > 0 ? \`
                        <div class="block-parameters">
                            <h3>📥 Parameters</h3>
                            <ul>
                                \${block.parameters.map(param =>
                                    \`<li><code>\${param.name}</code>\${param.type ? \`: \${param.type}\` : ''}</li>\`
                                ).join('')}
                            </ul>
                        </div>
                    \` : ''}

                    \${block.returnType ? \`
                        <div class="block-return">
                            <h3>📤 Returns</h3>
                            <p><code>\${block.returnType}</code></p>
                        </div>
                    \` : ''}

                    \${block.dependencies.length > 0 ? \`
                        <div class="block-dependencies">
                            <h3>🔗 Dependencies</h3>
                            <ul>
                                \${block.dependencies.map(dep => \`<li><code>\${dep}</code></li>\`).join('')}
                            </ul>
                        </div>
                    \` : ''}

                    <div class="block-code">
                        <h3>📝 Code</h3>
                        <pre><code>\${escapeHtml(block.fullText)}</code></pre>
                    </div>

                    <div class="block-context">
                        <h3>📍 Context</h3>
                        <p>\${block.context}</p>
                    </div>
                </div>
            \`;

            // Update progress and status
            document.getElementById('progress').textContent = \`\${block.type}: \${block.name}\`;
            document.getElementById('status').textContent = 'Semantic analysis complete - Explore code blocks by enabling interactive mode!';

            // Update debug info
            document.getElementById('debug-info').innerHTML =
                \`Block Analysis: \${block.type} | Complexity: \${block.complexity} | Importance: \${block.importance}\`;
        }

        function getBlockIcon(type) {
            const icons = {
                'function': '⚡',
                'method': '🔧',
                'class': '🏗️',
                'method-call': '📞',
                'property-access': '📋',
                'variable': '📦',
                'type-definition': '📝',
                'import': '📥'
            };
            return icons[type] || '🔍';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Cross-file analysis handler
        function handleCrossFileAnalysis(data) {
            console.log('🌐 Rendering cross-file analysis:', data);

            const contentDiv = document.getElementById('content');
            contentDiv.innerHTML = \`
                <div class="cross-file-analysis">
                    <div class="analysis-header">
                        <div class="source-block">
                            <h2>🎯 Source: \${escapeHtml(data.sourceBlock.name)}</h2>
                            <div class="block-meta">
                                <span class="badge badge-\${data.sourceBlock.type}">\${data.sourceBlock.type}</span>
                                <span class="file-name">📄 \${escapeHtml(data.sourceBlock.file)}</span>
                            </div>
                            \${data.sourceBlock.purpose ? \`<p class="purpose">💭 \${escapeHtml(data.sourceBlock.purpose)}</p>\` : ''}
                        </div>
                    </div>

                    <div class="analysis-sections">
                        <!-- Related Files Section -->
                        <div class="analysis-section">
                            <h3>🌐 Related Files (\${data.relatedFiles.length})</h3>
                            <div class="related-files-grid">
                                \${data.relatedFiles.map(file => \`
                                    <div class="file-card relationship-\${file.relationship}">
                                        <div class="file-header">
                                            <span class="file-icon">\${getRelationshipIcon(file.relationship)}</span>
                                            <span class="file-name">\${escapeHtml(file.fileName)}</span>
                                            <span class="confidence">\${file.confidence}</span>
                                        </div>
                                        <div class="relationship-type">\${formatRelationship(file.relationship)}</div>
                                        <div class="business-connection">\${escapeHtml(file.businessConnection)}</div>
                                        \${file.relevantBlocks.length > 0 ? \`
                                            <div class="relevant-blocks">
                                                \${file.relevantBlocks.map(block => \`
                                                    <span class="block-tag">\${getBlockIcon(block.blockType)} \${escapeHtml(block.blockName)}</span>
                                                \`).join('')}
                                            </div>
                                        \` : ''}
                                    </div>
                                \`).join('')}
                            </div>
                        </div>

                        <!-- Data Flows Section -->
                        \${data.dataFlows.length > 0 ? \`
                            <div class="analysis-section">
                                <h3>🔄 Data Flows (\${data.dataFlows.length})</h3>
                                <div class="data-flows">
                                    \${data.dataFlows.map(flow => \`
                                        <div class="data-flow flow-\${flow.direction}">
                                            <div class="flow-path">
                                                <span class="flow-origin">\${escapeHtml(flow.from)}</span>
                                                <span class="flow-arrow">\${getFlowArrow(flow.direction)}</span>
                                                <span class="flow-destination">\${escapeHtml(flow.to)}</span>
                                            </div>
                                            <div class="flow-details">
                                                <span class="data-type">\${escapeHtml(flow.dataType)}</span>
                                                <span class="transformation">\${escapeHtml(flow.transformation)}</span>
                                            </div>
                                            <div class="flow-purpose">\${escapeHtml(flow.purpose)}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \` : ''}

                        <!-- Business Flow Section -->
                        \${data.businessFlow && data.businessFlow.name ? \`
                            <div class="analysis-section">
                                <h3>🏢 Business Flow</h3>
                                <div class="business-flow">
                                    <h4>\${escapeHtml(data.businessFlow.name)}</h4>
                                    <div class="involved-files">
                                        <strong>📁 Files involved:</strong>
                                        \${data.businessFlow.files.map(file => \`<span class="file-chip">\${escapeHtml(file)}</span>\`).join('')}
                                    </div>
                                    \${data.businessFlow.steps.length > 0 ? \`
                                        <div class="flow-steps">
                                            <strong>📋 Main steps:</strong>
                                            <ol>
                                                \${data.businessFlow.steps.map(step => \`<li>\${escapeHtml(step)}</li>\`).join('')}
                                            </ol>
                                        </div>
                                    \` : ''}
                                    \${data.businessFlow.decisions.length > 0 ? \`
                                        <div class="decision-points">
                                            <strong>🎯 Key decision points:</strong>
                                            <ul>
                                                \${data.businessFlow.decisions.map(decision => \`<li>\${escapeHtml(decision)}</li>\`).join('')}
                                            </ul>
                                        </div>
                                    \` : ''}
                                </div>
                            </div>
                        \` : ''}

                        <!-- Navigation Trail Section -->
                        \${data.navigationTrail && data.navigationTrail.length > 0 ? \`
                            <div class="analysis-section">
                                <h3>🧭 Navigation Trail</h3>
                                <div class="navigation-trail">
                                    \${data.navigationTrail.map((nav, index) => \`
                                        <div class="nav-step \${index === data.navigationTrail.length - 1 ? 'current' : ''}">
                                            <div class="nav-number">\${index + 1}</div>
                                            <div class="nav-details">
                                                <div class="nav-target">\${escapeHtml(nav.file)} → \${escapeHtml(nav.block)}</div>
                                                <div class="nav-reason">\${escapeHtml(nav.reason)}</div>
                                                <div class="nav-time">\${nav.timestamp}</div>
                                            </div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \` : ''}
                    </div>

                    <div class="analysis-footer">
                        <div class="timestamp">🕒 Analysis completed at \${data.timestamp}</div>
                        <button onclick="refreshAnalysis()" class="refresh-btn">🔄 Refresh Analysis</button>
                    </div>
                </div>
            \`;

            // Update progress and status
            document.getElementById('progress').textContent = \`Cross-file: \${data.sourceBlock.name}\`;
            document.getElementById('status').textContent = 'Cross-file relationship analysis complete';
        }

        function getRelationshipIcon(relationship) {
            const icons = {
                'imports_from': '📥',
                'exports_to': '📤',
                'calls_function': '📞',
                'shares_type': '🔗',
                'extends_class': '🏗️',
                'implements_interface': '🎯'
            };
            return icons[relationship] || '🔍';
        }

        function formatRelationship(relationship) {
            return relationship.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
        }

        function getFlowArrow(direction) {
            const arrows = {
                'input': '⬅️',
                'output': '➡️',
                'bidirectional': '↔️'
            };
            return arrows[direction] || '➡️';
        }

        function refreshAnalysis() {
            vscode.postMessage({ command: 'refreshCrossFileAnalysis' });
        }
    </script>
</body>
</html>`;
    }

    public async showSemanticBlockAnalysis(block: SemanticBlock): Promise<void> {
        try {
            console.log('🧠 Showing enhanced semantic block analysis:', block.name);

            // Ensure webview is visible
            this.revealWebview();

            // Get enhanced data if AI analyzer is available
            let relatedBlocks: any[] = [];
            let explorationHistory: any = null;
            let mostAccessedBlocks: any[] = [];

            if (this.aiPoweredAnalyzer) {
                try {
                    // Get related blocks
                    relatedBlocks = await this.aiPoweredAnalyzer.getRelatedBlocks(block, '');

                    // Get exploration history
                    explorationHistory = this.aiPoweredAnalyzer.getExplorationHistory();

                    // Get most accessed blocks for quick navigation
                    mostAccessedBlocks = this.aiPoweredAnalyzer.getMostAccessedBlocks(5);
                } catch (error) {
                    console.warn('🧠 Failed to get enhanced analysis data:', error);
                }
            }

            // Send comprehensive block analysis to webview
            this.panel.webview.postMessage({
                command: 'showEnhancedBlockAnalysis',
                data: {
                    block: {
                        type: block.type,
                        name: block.name,
                        purpose: block.purpose || `Analyzing ${block.name}...`,
                        fullText: block.fullText,
                        context: block.context,
                        parameters: block.parameters || [],
                        returnType: block.returnType,
                        dependencies: block.dependencies || [],
                        metadata: block.metadata,
                        complexity: block.metadata.complexity,
                        importance: block.metadata.importance,
                        businessLogic: block.metadata.businessLogic,
                        hasExternalDependencies: block.metadata.hasExternalDependencies
                    },
                    relatedBlocks: relatedBlocks.slice(0, 10), // Limit to 10 related blocks
                    explorationHistory: {
                        sessionStarted: explorationHistory?.startTime?.toLocaleString() || 'Unknown',
                        blocksExplored: explorationHistory?.exploredBlocks?.length || 0,
                        navigationSteps: explorationHistory?.navigationPath?.length || 0,
                        feedbackGiven: explorationHistory?.userFeedback?.length || 0
                    },
                    quickNavigation: mostAccessedBlocks.map((memBlock: any) => ({
                        name: memBlock.blockName,
                        type: memBlock.blockType,
                        interactions: memBlock.userInteractions,
                        confidence: (memBlock.confidence * 100).toFixed(0) + '%'
                    })),
                    analysisType: 'enhanced-semantic-block',
                    timestamp: new Date().toLocaleString()
                }
            });

            console.log('🧠 Enhanced semantic block analysis sent to webview');
        } catch (error) {
            console.error('Error showing semantic block analysis:', error);
            vscode.window.showErrorMessage(`Failed to show analysis: ${error}`);
        }
    }

    /**
     * Show cross-file relationship analysis in webview
     */
    public showCrossFileAnalysis(context: CrossFileContext): void {
        try {
            console.log('🌐 Showing cross-file analysis for:', context.sourceBlock.name);

            // Ensure webview is visible
            this.revealWebview();

            // Send cross-file analysis to webview
            this.panel.webview.postMessage({
                command: 'showCrossFileAnalysis',
                data: {
                    sourceBlock: {
                        name: context.sourceBlock.name,
                        type: context.sourceBlock.type,
                        purpose: context.sourceBlock.purpose,
                        file: context.sourceFile.split('/').pop() || 'unknown'
                    },
                    relatedFiles: context.relatedFiles.map(file => ({
                        fileName: file.fileName,
                        relationship: file.relationship,
                        businessConnection: file.businessConnection,
                        confidence: (file.confidence * 100).toFixed(0) + '%',
                        relevantBlocks: file.relevantBlocks.slice(0, 3) // Limit for display
                    })),
                    dataFlows: context.dataFlows.map(flow => ({
                        from: flow.originFile.split('/').pop(),
                        to: flow.destinationFile.split('/').pop(),
                        dataType: flow.dataType,
                        transformation: flow.transformation,
                        direction: flow.flowDirection,
                        purpose: flow.businessPurpose
                    })),
                    businessFlow: {
                        name: context.businessFlow.flowName,
                        files: context.businessFlow.involvedFiles.map(file => file.split('/').pop()),
                        steps: context.businessFlow.mainSteps,
                        decisions: context.businessFlow.keyDecisionPoints
                    },
                    navigationTrail: context.navigationTrail.slice(-10).map(nav => ({
                        file: nav.file.split('/').pop(),
                        block: nav.block,
                        reason: nav.reason,
                        timestamp: nav.timestamp.toLocaleTimeString()
                    })),
                    timestamp: new Date().toLocaleString(),
                    analysisType: 'cross-file-intelligence'
                }
            });

            console.log('🌐 Cross-file analysis sent to webview');
        } catch (error) {
            console.error('Error showing cross-file analysis:', error);
            vscode.window.showErrorMessage(`Failed to show cross-file analysis: ${error}`);
        }
    }

    public dispose() {
        CodoraWebviewPanel.currentPanel = undefined;
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}