/**
 * Interactive Selection Provider - Handles Cmd+Shift hover and click interactions
 * Provides visual feedback and semantic block selection
 */

import * as vscode from 'vscode';
import { SemanticBlockAnalyzer, SemanticBlock } from '../semantic/SemanticBlockAnalyzer';

export class InteractiveSelectionProvider implements vscode.Disposable {
    private analyzer: SemanticBlockAnalyzer;
    private decorationType: vscode.TextEditorDecorationType | null = null;
    private currentHighlight: vscode.Range | null = null;
    private currentBlock: SemanticBlock | null = null;
    private disposables: vscode.Disposable[] = [];
    private isKeyPressed = false;

    constructor(analyzer: SemanticBlockAnalyzer) {
        this.analyzer = analyzer;
        this.createDecorationType();
        this.setupEventListeners();
    }

    private createDecorationType(): void {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 149, 237, 0.2)', // Soft blue highlight
            border: '1px solid rgba(100, 149, 237, 0.5)',
            borderRadius: '3px',
            cursor: 'pointer',
            after: {
                contentText: ' 🗺️ Click to explore',
                color: 'rgba(100, 149, 237, 0.8)',
                fontStyle: 'italic'
            }
        });
    }

    private setupEventListeners(): void {
        // Listen for key presses
        this.disposables.push(
            vscode.commands.registerCommand('type', (args) => {
                // This doesn't directly detect Cmd+Shift, so we'll use a different approach
                return vscode.commands.executeCommand('default:type', args);
            })
        );

        // Listen for mouse movements
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(this.onSelectionChange.bind(this))
        );

        // Register click handler command
        this.disposables.push(
            vscode.commands.registerCommand('codora.exploreSemanticBlock', this.handleBlockClick.bind(this))
        );

        // Listen for editor changes to clear highlights
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.clearHighlight();
            })
        );

        // Set up a timer-based approach for checking modifier keys
        this.startModifierKeyDetection();
    }

    private startModifierKeyDetection(): void {
        // Since VS Code doesn't provide direct access to modifier keys in hover,
        // we'll implement a command-based approach
        this.disposables.push(
            vscode.commands.registerCommand('codora.enableInteractiveMode', () => {
                this.isKeyPressed = true;
                setTimeout(() => {
                    this.isKeyPressed = false;
                    this.clearHighlight();
                }, 5000); // Auto-disable after 5 seconds
            })
        );

        // Register keybinding for enabling interactive mode
        this.disposables.push(
            vscode.commands.registerCommand('codora.toggleInteractiveSelection', () => {
                this.isKeyPressed = !this.isKeyPressed;
                if (!this.isKeyPressed) {
                    this.clearHighlight();
                }

                vscode.window.showInformationMessage(
                    `🗺️ Codora Interactive Mode: ${this.isKeyPressed ? 'ON' : 'OFF'}`,
                    'Guide'
                ).then(selection => {
                    if (selection === 'Guide') {
                        vscode.window.showInformationMessage(
                            '🗺️ Hover over code blocks to see semantic highlights. Click highlighted blocks to explore!'
                        );
                    }
                });
            })
        );
    }

    private async onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        if (!this.isKeyPressed) {
            return;
        }

        const editor = event.textEditor;
        const position = event.selections[0].active;

        // Only highlight if we have a valid position
        if (position) {
            await this.highlightBlockAt(editor, position);
        }
    }

    private async highlightBlockAt(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        try {
            const block = await this.analyzer.findBlockAt(editor.document, position);

            if (block && block.range) {
                // Only update if we're highlighting a different block
                if (!this.currentHighlight || !this.currentHighlight.isEqual(block.range)) {
                    this.clearHighlight();
                    this.currentHighlight = block.range;
                    this.currentBlock = block;

                    // Apply highlighting
                    if (this.decorationType) {
                        editor.setDecorations(this.decorationType, [
                            {
                                range: block.range,
                                hoverMessage: this.createHoverMessage(block)
                            }
                        ]);
                    }

                    console.log(`🗺️ Highlighted semantic block: ${block.type} - ${block.name}`);
                }
            } else {
                this.clearHighlight();
            }
        } catch (error) {
            console.error('🗺️ Error highlighting block:', error);
        }
    }

    private createHoverMessage(block: SemanticBlock): vscode.MarkdownString {
        const message = new vscode.MarkdownString();
        message.isTrusted = true;

        message.appendMarkdown(`### 🗺️ ${this.getBlockIcon(block.type)} ${block.name}\n\n`);
        message.appendMarkdown(`**Type:** ${block.type}\n\n`);

        if (block.purpose) {
            message.appendMarkdown(`**Purpose:** ${block.purpose}\n\n`);
        }

        if (block.parameters && block.parameters.length > 0) {
            message.appendMarkdown(`**Parameters:**\n`);
            block.parameters.forEach(param => {
                const description = (param as any).description ? ` - ${(param as any).description}` : '';
                message.appendMarkdown(`- \`${param.name}\`${param.type ? `: ${param.type}` : ''}${description}\n`);
            });
            message.appendMarkdown('\n');
        }

        if (block.dependencies && block.dependencies.length > 0) {
            message.appendMarkdown(`**Dependencies:** ${block.dependencies.join(', ')}\n\n`);
        }

        message.appendMarkdown(`**Complexity:** ${block.metadata.complexity} | **Importance:** ${block.metadata.importance}\n\n`);

        if (block.metadata.businessLogic) {
            message.appendMarkdown('💼 **Contains business logic**\n\n');
        }

        const commandUri = vscode.Uri.parse(`command:codora.exploreSemanticBlock?${encodeURIComponent(JSON.stringify({
            blockType: block.type,
            blockName: block.name,
            range: {
                start: { line: block.range.start.line, character: block.range.start.character },
                end: { line: block.range.end.line, character: block.range.end.character }
            },
            uri: 'PLACEHOLDER_URI' // Will be replaced when used
        }))}`);

        message.appendMarkdown(`[🚀 **Explore in Codora**](${commandUri} "Open detailed analysis in Codora Explorer")`);

        return message;
    }

    private getBlockIcon(type: SemanticBlock['type']): string {
        switch (type) {
            case 'function': return '⚡';
            case 'method': return '🔧';
            case 'class': return '🏗️';
            case 'method-call': return '📞';
            case 'property-access': return '📋';
            case 'variable': return '📦';
            case 'type-definition': return '📝';
            case 'import': return '📥';
            default: return '🔍';
        }
    }

    public async handleBlockClick(args?: string): Promise<void> {
        try {
            if (!this.currentBlock) {
                vscode.window.showWarningMessage('🗺️ No semantic block selected');
                return;
            }

            console.log('🗺️ Exploring semantic block:', this.currentBlock);

            // Get the AI-powered analysis
            const explanation = await this.generateBlockExplanation(this.currentBlock);
            this.currentBlock.purpose = explanation;

            // Open Codora Explorer with the block analysis
            const { CodoraWebviewPanel } = require('../webviewPanel');
            const webviewPanel = CodoraWebviewPanel.getInstance(undefined as any);

            if (webviewPanel) {
                webviewPanel.showSemanticBlockAnalysis(this.currentBlock);
            }

            vscode.window.showInformationMessage(
                `🗺️ Analyzing: ${this.currentBlock.name}`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details' && webviewPanel) {
                    webviewPanel.focusWebview();
                }
            });

        } catch (error) {
            console.error('🗺️ Error handling block click:', error);
            vscode.window.showErrorMessage(`🗺️ Failed to explore block: ${error}`);
        }
    }

    private async generateBlockExplanation(block: SemanticBlock): Promise<string> {
        // Phase 4: AI-powered explanation generation
        if (block.purpose) {
            // AI analysis already available from semantic analyzer
            return block.purpose;
        }

        // Fallback explanations if AI analysis isn't available
        const purposes: Record<string, string> = {
            'function': `Executes ${block.name} operation with ${block.parameters?.length || 0} parameters`,
            'method': `Performs ${block.name} action on the parent object`,
            'method-call': `Calls ${block.name} - likely handles business logic or external operations`,
            'class': `Defines ${block.name} entity with its properties and behaviors`,
            'variable': `Stores ${block.name} value for use in the current scope`,
            'property-access': `Accesses ${block.name} property from an object`,
            'type-definition': `Defines the structure and constraints for ${block.name} type`
        };

        return purposes[block.type] || `Handles ${block.name} functionality`;
    }

    private clearHighlight(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.decorationType) {
            editor.setDecorations(this.decorationType, []);
        }
        this.currentHighlight = null;
        this.currentBlock = null;
    }

    public getCurrentBlock(): SemanticBlock | null {
        return this.currentBlock;
    }

    public isInteractiveModeEnabled(): boolean {
        return this.isKeyPressed;
    }

    public enableInteractiveMode(): void {
        this.isKeyPressed = true;
    }

    public disableInteractiveMode(): void {
        this.isKeyPressed = false;
        this.clearHighlight();
    }

    public dispose(): void {
        this.clearHighlight();
        if (this.decorationType) {
            this.decorationType.dispose();
        }
        this.disposables.forEach(d => d.dispose());
    }
}