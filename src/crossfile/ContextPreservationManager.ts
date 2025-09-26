/**
 * Context Preservation Manager - Maintains cross-file context during navigation sessions
 * Preserves user's mental model and understanding as they explore code relationships
 */

import * as vscode from 'vscode';
import { SemanticBlock } from '../semantic/SemanticBlockAnalyzer';
import { CrossFileContext } from './CrossFileAnalyzer';
import { NavigationSession } from './IntelligentNavigator';

export interface PreservedContext {
    sessionId: string;
    originalTask: string;
    mentalModel: {
        currentFocus: string;
        keyInsights: string[];
        assumptions: string[];
        questionsToAnswer: string[];
    };
    explorationPath: Array<{
        file: string;
        block: string;
        purpose: string;
        keyLearnings: string[];
        timestamp: Date;
    }>;
    crossFileConnections: Map<string, CrossFileContext>;
    userAnnotations: Array<{
        location: { file: string; line: number };
        note: string;
        type: 'insight' | 'question' | 'todo' | 'connection';
        timestamp: Date;
    }>;
    bookmarks: Array<{
        file: string;
        block: string;
        reason: string;
        importance: 'high' | 'medium' | 'low';
        timestamp: Date;
    }>;
    contextSwitches: Array<{
        from: { file: string; block: string };
        to: { file: string; block: string };
        reason: string;
        preservedState: string;
        timestamp: Date;
    }>;
}

export interface ContextState {
    currentLocation: { file: string; block: string };
    relevantFiles: string[];
    activeConnections: string[];
    workingMemory: Array<{
        concept: string;
        definition: string;
        examples: string[];
        relatedConcepts: string[];
    }>;
    temporalContext: {
        sessionDuration: number;
        explorationDepth: number;
        complexityLevel: 'beginner' | 'intermediate' | 'advanced';
        learningStyle: 'detail-first' | 'overview-first' | 'connection-focused';
    };
}

export class ContextPreservationManager {
    private preservedContexts = new Map<string, PreservedContext>();
    private currentContext?: PreservedContext;
    private contextStateHistory: ContextState[] = [];
    private maxHistorySize = 50;

    /**
     * Start a new context preservation session
     */
    public startNewSession(
        originalTask: string,
        initialFile: string,
        initialBlock: string
    ): string {
        const sessionId = this.generateSessionId();

        const preservedContext: PreservedContext = {
            sessionId,
            originalTask,
            mentalModel: {
                currentFocus: `Understanding ${initialBlock} in ${this.getFileName(initialFile)}`,
                keyInsights: [],
                assumptions: [],
                questionsToAnswer: [
                    `What does ${initialBlock} do?`,
                    'How does it connect to other parts of the system?',
                    'What are its dependencies and relationships?'
                ]
            },
            explorationPath: [{
                file: initialFile,
                block: initialBlock,
                purpose: 'Starting point for exploration',
                keyLearnings: [],
                timestamp: new Date()
            }],
            crossFileConnections: new Map(),
            userAnnotations: [],
            bookmarks: [],
            contextSwitches: []
        };

        this.preservedContexts.set(sessionId, preservedContext);
        this.currentContext = preservedContext;

        console.log(`🧠 Started context preservation session: ${sessionId}`);
        return sessionId;
    }

    /**
     * Record navigation between files/blocks with context preservation
     */
    public recordNavigation(
        from: { file: string; block: string },
        to: { file: string; block: string },
        reason: string,
        crossFileContext: CrossFileContext
    ): void {
        if (!this.currentContext) {
            console.warn('🧠 No active context session');
            return;
        }

        // Preserve current state before switching
        const preservedState = this.captureCurrentState(from, crossFileContext);

        // Record context switch
        this.currentContext.contextSwitches.push({
            from,
            to,
            reason,
            preservedState,
            timestamp: new Date()
        });

        // Update exploration path
        this.currentContext.explorationPath.push({
            file: to.file,
            block: to.block,
            purpose: reason,
            keyLearnings: [],
            timestamp: new Date()
        });

        // Store cross-file context
        const contextKey = `${to.file}:${to.block}`;
        this.currentContext.crossFileConnections.set(contextKey, crossFileContext);

        // Update mental model
        this.updateMentalModel(to, reason);

        console.log(`🧠 Recorded navigation: ${from.file}:${from.block} → ${to.file}:${to.block}`);
    }

    /**
     * Add user annotation at current location
     */
    public addAnnotation(
        location: { file: string; line: number },
        note: string,
        type: 'insight' | 'question' | 'todo' | 'connection'
    ): void {
        if (!this.currentContext) {
            console.warn('🧠 No active context session');
            return;
        }

        this.currentContext.userAnnotations.push({
            location,
            note,
            type,
            timestamp: new Date()
        });

        // Update mental model based on annotation type
        switch (type) {
            case 'insight':
                this.currentContext.mentalModel.keyInsights.push(note);
                break;
            case 'question':
                this.currentContext.mentalModel.questionsToAnswer.push(note);
                break;
        }

        console.log(`🧠 Added ${type} annotation: ${note}`);
    }

    /**
     * Create bookmark for important code location
     */
    public createBookmark(
        file: string,
        block: string,
        reason: string,
        importance: 'high' | 'medium' | 'low' = 'medium'
    ): void {
        if (!this.currentContext) {
            console.warn('🧠 No active context session');
            return;
        }

        this.currentContext.bookmarks.push({
            file,
            block,
            reason,
            importance,
            timestamp: new Date()
        });

        console.log(`🧠 Created ${importance} bookmark: ${block} in ${this.getFileName(file)}`);
    }

    /**
     * Get context-aware navigation suggestions
     */
    public getContextualSuggestions(): Array<{
        type: 'bookmark' | 'recent' | 'related' | 'unexplored';
        target: { file: string; block: string };
        reason: string;
        priority: number;
    }> {
        if (!this.currentContext) {
            return [];
        }

        const suggestions: Array<{
            type: 'bookmark' | 'recent' | 'related' | 'unexplored';
            target: { file: string; block: string };
            reason: string;
            priority: number;
        }> = [];

        // High-priority bookmarks
        this.currentContext.bookmarks
            .filter(b => b.importance === 'high')
            .slice(0, 3)
            .forEach(bookmark => {
                suggestions.push({
                    type: 'bookmark',
                    target: { file: bookmark.file, block: bookmark.block },
                    reason: `Important bookmark: ${bookmark.reason}`,
                    priority: 0.9
                });
            });

        // Recent exploration path (exclude current)
        this.currentContext.explorationPath
            .slice(-5, -1)
            .reverse()
            .forEach((path, index) => {
                suggestions.push({
                    type: 'recent',
                    target: { file: path.file, block: path.block },
                    reason: `Recent: ${path.purpose}`,
                    priority: 0.7 - (index * 0.1)
                });
            });

        // Related but unexplored connections
        this.currentContext.crossFileConnections.forEach((context, key) => {
            context.relatedFiles
                .filter(f => !this.isExplored(f.fileUri))
                .slice(0, 2)
                .forEach(file => {
                    suggestions.push({
                        type: 'unexplored',
                        target: { file: file.fileUri, block: file.relevantBlocks[0]?.blockName || 'unknown' },
                        reason: `Unexplored: ${file.businessConnection}`,
                        priority: 0.6 * file.confidence
                    });
                });
        });

        return suggestions
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 8);
    }

    /**
     * Get context summary for display
     */
    public getContextSummary(): {
        session: string;
        task: string;
        progress: {
            filesExplored: number;
            blocksAnalyzed: number;
            connectionsFound: number;
            insightsCaptured: number;
        };
        currentFocus: string;
        recentPath: string[];
        bookmarks: number;
        annotations: number;
    } {
        if (!this.currentContext) {
            return {
                session: 'No active session',
                task: '',
                progress: { filesExplored: 0, blocksAnalyzed: 0, connectionsFound: 0, insightsCaptured: 0 },
                currentFocus: '',
                recentPath: [],
                bookmarks: 0,
                annotations: 0
            };
        }

        const ctx = this.currentContext;
        const uniqueFiles = new Set(ctx.explorationPath.map(p => p.file));

        return {
            session: ctx.sessionId,
            task: ctx.originalTask,
            progress: {
                filesExplored: uniqueFiles.size,
                blocksAnalyzed: ctx.explorationPath.length,
                connectionsFound: ctx.crossFileConnections.size,
                insightsCaptured: ctx.mentalModel.keyInsights.length
            },
            currentFocus: ctx.mentalModel.currentFocus,
            recentPath: ctx.explorationPath.slice(-5).map(p => `${this.getFileName(p.file)}:${p.block}`),
            bookmarks: ctx.bookmarks.length,
            annotations: ctx.userAnnotations.length
        };
    }

    /**
     * Restore context from previous session
     */
    public restoreSession(sessionId: string): PreservedContext | null {
        const context = this.preservedContexts.get(sessionId);
        if (context) {
            this.currentContext = context;
            console.log(`🧠 Restored context session: ${sessionId}`);
            return context;
        }
        return null;
    }

    /**
     * Export context for persistence
     */
    public exportContext(sessionId?: string): string {
        const context = sessionId ? this.preservedContexts.get(sessionId) : this.currentContext;
        if (!context) {
            return '{}';
        }

        // Convert Map to object for JSON serialization
        const exportData = {
            ...context,
            crossFileConnections: Array.from(context.crossFileConnections.entries())
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import context from persistence
     */
    public importContext(data: string): string | null {
        try {
            const imported = JSON.parse(data);

            // Convert object back to Map
            imported.crossFileConnections = new Map(imported.crossFileConnections);

            this.preservedContexts.set(imported.sessionId, imported);
            console.log(`🧠 Imported context session: ${imported.sessionId}`);
            return imported.sessionId;
        } catch (error) {
            console.error('🧠 Failed to import context:', error);
            return null;
        }
    }

    /**
     * Clear old sessions and optimize memory
     */
    public cleanupSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
        const cutoff = new Date(Date.now() - maxAge);
        let cleaned = 0;

        this.preservedContexts.forEach((context, sessionId) => {
            const lastActivity = Math.max(...context.explorationPath.map(p => p.timestamp.getTime()));
            if (lastActivity < cutoff.getTime()) {
                this.preservedContexts.delete(sessionId);
                cleaned++;
            }
        });

        console.log(`🧠 Cleaned up ${cleaned} old context sessions`);
    }

    // Private helper methods

    private generateSessionId(): string {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getFileName(filePath: string): string {
        return filePath.split('/').pop() || 'unknown';
    }

    private captureCurrentState(
        location: { file: string; block: string },
        crossFileContext: CrossFileContext
    ): string {
        return JSON.stringify({
            location,
            relatedFiles: crossFileContext.relatedFiles.length,
            dataFlows: crossFileContext.dataFlows.length,
            businessFlow: crossFileContext.businessFlow.flowName
        });
    }

    private updateMentalModel(
        location: { file: string; block: string },
        reason: string
    ): void {
        if (!this.currentContext) {
            return;
        }

        this.currentContext.mentalModel.currentFocus =
            `Exploring ${location.block} in ${this.getFileName(location.file)} - ${reason}`;

        // Add navigation as a potential insight
        if (reason.includes('relationship') || reason.includes('connection')) {
            this.currentContext.mentalModel.keyInsights.push(
                `Found connection: ${location.block} ${reason}`
            );
        }
    }

    private isExplored(fileUri: string): boolean {
        if (!this.currentContext) {
            return false;
        }
        return this.currentContext.explorationPath.some(p => p.file === fileUri);
    }
}