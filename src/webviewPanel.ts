import * as vscode from 'vscode';

export class CodoraWebviewPanel {
    private static currentPanel: CodoraWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

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
    private astAnalyzer: any = null;

    private handleNextLine() {
        if (!this.currentDocument) {
            return;
        }

        if (this.currentLine < this.currentDocument.lineCount - 1) {
            this.currentLine++;
            this.updateLineExplanation();
        } else {
            vscode.window.showInformationMessage('마지막 라인에 도달했습니다.');
        }
    }

    private handlePreviousLine() {
        if (!this.currentDocument) {
            return;
        }

        if (this.currentLine > 0) {
            this.currentLine--;
            this.updateLineExplanation();
        } else {
            vscode.window.showInformationMessage('첫 번째 라인입니다.');
        }
    }

    private async updateLineExplanation() {
        if (!this.currentDocument || !this.astAnalyzer) {
            return;
        }

        const lineInfo = this.astAnalyzer.analyzeLineAt(this.currentDocument, this.currentLine);

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

    public startLineByLineExploration(document: vscode.TextDocument, startLine: number = 0) {
        try {
            console.log('🗺️ Starting line-by-line exploration...'); // Debug log

            // Ensure webview is visible FIRST
            this.revealWebview();

            // Try to load AST analyzer
            try {
                const astAnalyzer = require('./astAnalyzer').ASTAnalyzer;
                this.astAnalyzer = new astAnalyzer();
                this.astAnalyzer.analyzeDocument(document);
            } catch (error) {
                console.warn('AST Analyzer failed to load, continuing without it:', error);
                // Continue without AST analyzer - basic functionality will still work
            }

            this.currentDocument = document;
            this.currentLine = startLine;

            // Show initial content
            this.updateLineExplanationSafe();

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

    private updateLineExplanationSafe() {
        if (!this.currentDocument) {
            return;
        }

        try {
            let lineInfo;

            if (this.astAnalyzer) {
                // Use AST analyzer if available
                lineInfo = this.astAnalyzer.analyzeLineAt(this.currentDocument, this.currentLine);
            } else {
                // Fallback to basic line info
                const line = this.currentDocument.lineAt(this.currentLine);
                lineInfo = {
                    content: line.text,
                    explanation: "Basic line analysis (AST analyzer unavailable)",
                    type: 'unknown',
                    variables: [],
                    functions: []
                };
            }

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

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
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