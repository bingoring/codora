import * as vscode from 'vscode';
import { CodoraWebviewPanel } from './webviewPanel';
import { SymbolExtractor } from './symbolExtractor';
import { AIManager } from './ai/AIManager';

export class CodoraHoverProvider implements vscode.HoverProvider {

    constructor(
        private webviewPanel: CodoraWebviewPanel,
        private symbolExtractor: SymbolExtractor,
        private aiManager: AIManager
    ) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {

        // Check if hover is enabled in settings
        const config = vscode.workspace.getConfiguration('codora');
        const isHoverEnabled = config.get<boolean>('features.showHoverButtons', true);

        if (!isHoverEnabled) {
            return null;
        }

        // Check if we're hovering over a significant code symbol
        const symbol = await this.symbolExtractor.getSymbolAt(document, position);

        if (!symbol || !this.isSignificantSymbol(symbol)) {
            return null;
        }

        // Create hover content with guide buttons
        const markdown = this.createHoverMarkdown(symbol, document, position);

        // Return hover with the markdown content positioned to not interfere with native hovers
        return new vscode.Hover(
            markdown,
            symbol.range || new vscode.Range(position, position)
        );
    }

    private isSignificantSymbol(symbol: any): boolean {
        // Check if the symbol is worth showing a guide for
        // Functions, classes, interfaces, methods are significant
        const significantKinds = [
            vscode.SymbolKind.Function,
            vscode.SymbolKind.Method,
            vscode.SymbolKind.Class,
            vscode.SymbolKind.Interface,
            vscode.SymbolKind.Constructor,
            vscode.SymbolKind.Module,
            vscode.SymbolKind.Namespace
        ];

        return symbol.kind && significantKinds.includes(symbol.kind);
    }

    private createHoverMarkdown(
        symbol: any,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.MarkdownString {

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        // Very compact approach - just show minimal Codora controls at the bottom
        // This appears below VSCode's native hover content
        markdown.appendMarkdown(`\\n\\n---\\n`);
        markdown.appendMarkdown(`🗺️ **Codora**: `);

        // Create command arguments as array - VS Code command URIs expect arrays
        const commandArgs = [
            document.uri.toString(),
            position.line,
            position.character,
            symbol.name
        ];

        // Guide buttons positioned at the bottom to avoid VSCode native hover conflicts
        const startExplorationCommand = `command:codora.startExplorationFromHover?${encodeURIComponent(JSON.stringify(commandArgs))}`;
        const quickInfoCommand = `command:codora.showQuickInfo?${encodeURIComponent(JSON.stringify(commandArgs))}`;

        // Compact inline buttons
        markdown.appendMarkdown(`[🚀 Explore](${startExplorationCommand} "Start interactive code exploration") • `);
        markdown.appendMarkdown(`[🔍 Info](${quickInfoCommand} "Show quick information")\\n`);

        return markdown;
    }

    private getSymbolKindName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'Function';
            case vscode.SymbolKind.Method: return 'Method';
            case vscode.SymbolKind.Class: return 'Class';
            case vscode.SymbolKind.Interface: return 'Interface';
            case vscode.SymbolKind.Constructor: return 'Constructor';
            case vscode.SymbolKind.Module: return 'Module';
            case vscode.SymbolKind.Namespace: return 'Namespace';
            case vscode.SymbolKind.Variable: return 'Variable';
            case vscode.SymbolKind.Constant: return 'Constant';
            default: return 'Symbol';
        }
    }
}