/**
 * Intelligent Navigator - Contextual navigation between related code blocks
 * Preserves context and provides meaningful transitions between files
 */

import * as vscode from 'vscode';
import { SemanticBlock } from '../semantic/SemanticBlockAnalyzer';
import { CrossFileAnalyzer, CrossFileContext } from './CrossFileAnalyzer';

export interface NavigationContext {
    originFile: string;
    originBlock: SemanticBlock;
    targetFile: string;
    targetBlock?: {
        name: string;
        type: SemanticBlock['type'];
        range?: vscode.Range;
    };
    navigationReason: string;
    preservedContext: string;
    timestamp: Date;
}

export interface NavigationSession {
    sessionId: string;
    startTime: Date;
    navigations: NavigationContext[];
    currentContext?: CrossFileContext;
    breadcrumbTrail: Array<{
        file: string;
        block: string;
        purpose: string;
        timestamp: Date;
    }>;
}

export class IntelligentNavigator {
    private crossFileAnalyzer: CrossFileAnalyzer;
    private currentSession: NavigationSession;
    private navigationHistory: NavigationSession[] = [];

    constructor(crossFileAnalyzer: CrossFileAnalyzer) {
        this.crossFileAnalyzer = crossFileAnalyzer;
        this.currentSession = this.createNewSession();
    }

    /**
     * Navigate to related code with full context preservation
     */
    public async navigateWithContext(
        fromBlock: SemanticBlock,
        fromFileUri: string,
        targetFileUri: string,
        targetBlockName?: string,
        reason?: string
    ): Promise<NavigationContext> {
        try {
            console.log(`🧭 Intelligent navigation: ${fromBlock.name} → ${targetFileUri}`);

            // Analyze relationships if not already done
            if (!this.currentSession.currentContext ||
                this.currentSession.currentContext.sourceFile !== fromFileUri) {
                this.currentSession.currentContext = await this.crossFileAnalyzer.analyzeRelationships(
                    fromBlock,
                    fromFileUri
                );
            }

            // Find or infer the target block
            const targetBlock = await this.findTargetBlock(targetFileUri, targetBlockName);

            // Determine navigation reason
            const navigationReason = reason || this.inferNavigationReason(
                fromBlock,
                targetFileUri,
                this.currentSession.currentContext
            );

            // Create navigation context
            const navigationContext: NavigationContext = {
                originFile: fromFileUri,
                originBlock: fromBlock,
                targetFile: targetFileUri,
                targetBlock,
                navigationReason,
                preservedContext: this.generatePreservedContext(fromBlock, this.currentSession.currentContext),
                timestamp: new Date()
            };

            // Record navigation in session
            this.currentSession.navigations.push(navigationContext);

            // Update breadcrumb trail
            this.updateBreadcrumbTrail(navigationContext);

            // Record in cross-file analyzer
            if (this.currentSession.currentContext && targetBlock) {
                this.crossFileAnalyzer.recordNavigation(
                    this.currentSession.currentContext,
                    targetFileUri,
                    targetBlock.name,
                    navigationReason
                );
            }

            // Perform the actual navigation
            await this.performNavigation(navigationContext);

            console.log(`🧭 Navigation completed: ${navigationReason}`);
            return navigationContext;

        } catch (error) {
            console.error('🧭 Navigation failed:', error);
            throw new Error(`Navigation failed: ${error}`);
        }
    }

    /**
     * Get intelligent navigation suggestions for current context
     */
    public getNavigationSuggestions(
        currentBlock: SemanticBlock,
        currentFileUri: string
    ): Promise<Array<{
        targetFile: string;
        targetBlock: string;
        reason: string;
        confidence: number;
        quickAction: string; // "Jump to definition", "View caller", etc.
    }>> {
        return new Promise(async (resolve) => {
            try {
                // Get cross-file context
                const context = await this.crossFileAnalyzer.analyzeRelationships(currentBlock, currentFileUri);

                const suggestions = this.crossFileAnalyzer.getNavigationSuggestions(context);

                const enhancedSuggestions = suggestions.map(suggestion => ({
                    targetFile: suggestion.file,
                    targetBlock: suggestion.block,
                    reason: suggestion.reason,
                    confidence: suggestion.confidence,
                    quickAction: this.determineQuickAction(suggestion.reason)
                }));

                resolve(enhancedSuggestions);
            } catch (error) {
                console.error('🧭 Failed to get navigation suggestions:', error);
                resolve([]);
            }
        });
    }

    /**
     * Navigate back in the breadcrumb trail
     */
    public async navigateBack(): Promise<NavigationContext | null> {
        if (this.currentSession.breadcrumbTrail.length < 2) {
            return null;
        }

        // Remove current position
        this.currentSession.breadcrumbTrail.pop();

        // Get previous position
        const previousPosition = this.currentSession.breadcrumbTrail[this.currentSession.breadcrumbTrail.length - 1];

        try {
            // Open the previous file
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(previousPosition.file));
            await vscode.window.showTextDocument(document);

            // Create navigation context for back navigation
            const backNavigation: NavigationContext = {
                originFile: this.getCurrentFileUri(),
                originBlock: this.getCurrentBlock(), // Would need to be tracked
                targetFile: previousPosition.file,
                targetBlock: {
                    name: previousPosition.block,
                    type: 'function' // Default, would need better tracking
                },
                navigationReason: 'Navigate back in breadcrumb trail',
                preservedContext: previousPosition.purpose,
                timestamp: new Date()
            };

            this.currentSession.navigations.push(backNavigation);

            console.log(`🧭 Navigated back to: ${previousPosition.file}:${previousPosition.block}`);
            return backNavigation;

        } catch (error) {
            console.error('🧭 Back navigation failed:', error);
            return null;
        }
    }

    /**
     * Get current navigation session information
     */
    public getCurrentSession(): NavigationSession {
        return { ...this.currentSession };
    }

    /**
     * Get navigation history across sessions
     */
    public getNavigationHistory(): NavigationSession[] {
        return [...this.navigationHistory];
    }

    /**
     * Start a new navigation session
     */
    public startNewSession(): NavigationSession {
        // Save current session to history
        if (this.currentSession.navigations.length > 0) {
            this.navigationHistory.push(this.currentSession);

            // Keep only last 10 sessions
            if (this.navigationHistory.length > 10) {
                this.navigationHistory = this.navigationHistory.slice(-10);
            }
        }

        this.currentSession = this.createNewSession();
        console.log(`🧭 Started new navigation session: ${this.currentSession.sessionId}`);
        return this.currentSession;
    }

    /**
     * Get breadcrumb trail for UI display
     */
    public getBreadcrumbTrail(): Array<{
        file: string;
        block: string;
        purpose: string;
        timestamp: Date;
        isCurrent: boolean;
    }> {
        return this.currentSession.breadcrumbTrail.map((crumb, index) => ({
            ...crumb,
            isCurrent: index === this.currentSession.breadcrumbTrail.length - 1
        }));
    }

    /**
     * Clear navigation history and start fresh
     */
    public clearHistory(): void {
        this.navigationHistory = [];
        this.currentSession = this.createNewSession();
        console.log('🧭 Navigation history cleared');
    }

    // Private helper methods

    private createNewSession(): NavigationSession {
        return {
            sessionId: `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: new Date(),
            navigations: [],
            breadcrumbTrail: []
        };
    }

    private async findTargetBlock(
        targetFileUri: string,
        targetBlockName?: string
    ): Promise<NavigationContext['targetBlock']> {
        if (!targetBlockName) {
            return undefined;
        }

        try {
            // Try to find the block using VS Code's symbol provider
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                vscode.Uri.parse(targetFileUri)
            );

            if (symbols) {
                const findSymbolRecursively = (symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined => {
                    for (const symbol of symbols) {
                        if (symbol.name === targetBlockName) {
                            return symbol;
                        }
                        if (symbol.children) {
                            const found = findSymbolRecursively(symbol.children);
                            if (found) {return found;}
                        }
                    }
                    return undefined;
                };

                const targetSymbol = findSymbolRecursively(symbols);
                if (targetSymbol) {
                    return {
                        name: targetSymbol.name,
                        type: this.mapSymbolKindToBlockType(targetSymbol.kind),
                        range: targetSymbol.range
                    };
                }
            }

            // Fallback
            return {
                name: targetBlockName,
                type: 'function'
            };
        } catch (error) {
            console.warn('🧭 Could not find target block:', error);
            return targetBlockName ? { name: targetBlockName, type: 'function' } : undefined;
        }
    }

    private inferNavigationReason(
        fromBlock: SemanticBlock,
        targetFileUri: string,
        context: CrossFileContext
    ): string {
        const targetFileName = targetFileUri.split('/').pop() || 'unknown file';

        // Look for specific relationship in context
        const relatedFile = context.relatedFiles.find(f => f.fileUri === targetFileUri);
        if (relatedFile) {
            switch (relatedFile.relationship) {
                case 'calls_function':
                    return `Exploring function call from ${fromBlock.name}`;
                case 'imports_from':
                    return `Viewing imported functionality from ${targetFileName}`;
                case 'exports_to':
                    return `Checking where ${fromBlock.name} is exported to`;
                case 'shares_type':
                    return `Examining shared type definitions in ${targetFileName}`;
                default:
                    return relatedFile.businessConnection;
            }
        }

        // Fallback reasons
        return `Navigating to related code in ${targetFileName}`;
    }

    private generatePreservedContext(
        fromBlock: SemanticBlock,
        crossFileContext: CrossFileContext
    ): string {
        const context = [
            `Origin: ${fromBlock.name} (${fromBlock.type})`,
            fromBlock.purpose ? `Purpose: ${fromBlock.purpose}` : '',
            crossFileContext.businessFlow ? `Business Flow: ${crossFileContext.businessFlow.flowName}` : ''
        ].filter(Boolean).join(' | ');

        return context;
    }

    private updateBreadcrumbTrail(navigationContext: NavigationContext): void {
        const targetFileName = navigationContext.targetFile.split('/').pop() || 'unknown';

        this.currentSession.breadcrumbTrail.push({
            file: navigationContext.targetFile,
            block: navigationContext.targetBlock?.name || 'unknown',
            purpose: navigationContext.navigationReason,
            timestamp: navigationContext.timestamp
        });

        // Keep breadcrumb trail manageable
        if (this.currentSession.breadcrumbTrail.length > 15) {
            this.currentSession.breadcrumbTrail = this.currentSession.breadcrumbTrail.slice(-15);
        }
    }

    private async performNavigation(navigationContext: NavigationContext): Promise<void> {
        try {
            // Open the target file
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(navigationContext.targetFile));
            const editor = await vscode.window.showTextDocument(document);

            // If we have a target block with range, navigate to it
            if (navigationContext.targetBlock?.range) {
                const position = navigationContext.targetBlock.range.start;
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(navigationContext.targetBlock.range, vscode.TextEditorRevealType.InCenter);
            }

            // Show information about the navigation
            vscode.window.showInformationMessage(
                `🧭 ${navigationContext.navigationReason}`,
                'Show Context'
            ).then(selection => {
                if (selection === 'Show Context') {
                    vscode.window.showInformationMessage(navigationContext.preservedContext);
                }
            });

        } catch (error) {
            console.error('🧭 Failed to perform navigation:', error);
            throw error;
        }
    }

    private determineQuickAction(reason: string): string {
        if (reason.toLowerCase().includes('import')) {
            return 'View imported code';
        }
        if (reason.toLowerCase().includes('call')) {
            return 'Jump to function';
        }
        if (reason.toLowerCase().includes('type')) {
            return 'Check type definition';
        }
        if (reason.toLowerCase().includes('export')) {
            return 'View export usage';
        }
        return 'Navigate to related code';
    }

    private mapSymbolKindToBlockType(kind: vscode.SymbolKind): SemanticBlock['type'] {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'function';
            case vscode.SymbolKind.Method: return 'method';
            case vscode.SymbolKind.Class: return 'class';
            case vscode.SymbolKind.Variable:
            case vscode.SymbolKind.Constant: return 'variable';
            case vscode.SymbolKind.Interface: return 'type-definition';
            default: return 'function';
        }
    }

    // Helper methods for getting current context (would need to be properly implemented)
    private getCurrentFileUri(): string {
        return vscode.window.activeTextEditor?.document.uri.toString() || '';
    }

    private getCurrentBlock(): SemanticBlock {
        // This would need to be properly implemented to get the current block
        return {
            type: 'function',
            name: 'unknown',
            range: new vscode.Range(0, 0, 0, 0),
            fullText: '',
            context: '',
            metadata: {
                complexity: 'medium',
                importance: 'medium',
                businessLogic: false,
                hasExternalDependencies: false
            }
        };
    }

    /**
     * Get statistics about navigation patterns
     */
    public getNavigationStats(): {
        totalSessions: number;
        totalNavigations: number;
        averageNavigationsPerSession: number;
        mostCommonNavigationReasons: Array<{reason: string, count: number}>;
        sessionDurations: number[]; // in minutes
    } {
        const allSessions = [...this.navigationHistory, this.currentSession];
        const totalSessions = allSessions.length;
        const totalNavigations = allSessions.reduce((sum, session) => sum + session.navigations.length, 0);

        // Count navigation reasons
        const reasonCounts = new Map<string, number>();
        allSessions.forEach(session => {
            session.navigations.forEach(nav => {
                const count = reasonCounts.get(nav.navigationReason) || 0;
                reasonCounts.set(nav.navigationReason, count + 1);
            });
        });

        const mostCommonNavigationReasons = Array.from(reasonCounts.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const sessionDurations = allSessions.map(session => {
            if (session.navigations.length === 0) {return 0;}
            const lastNav = session.navigations[session.navigations.length - 1];
            const duration = (lastNav.timestamp.getTime() - session.startTime.getTime()) / (1000 * 60);
            return Math.round(duration * 10) / 10; // Round to 1 decimal place
        });

        return {
            totalSessions,
            totalNavigations,
            averageNavigationsPerSession: totalSessions > 0 ? totalNavigations / totalSessions : 0,
            mostCommonNavigationReasons,
            sessionDurations
        };
    }
}