/**
 * Context Memory Manager - Persistent storage for AI analysis results
 * Provides cross-session memory and intelligent context retrieval
 */

import * as vscode from 'vscode';
import { SemanticBlock } from '../semantic/SemanticBlockAnalyzer';
import { AIAnalysisResult } from '../ai/AIPoweredAnalyzer';

export interface CodeBlockMemory {
    fileUri: string;
    blockSignature: string;
    blockType: SemanticBlock['type'];
    blockName: string;
    lastAnalyzed: Date;
    aiAnalysis: AIAnalysisResult;
    userInteractions: number;
    confidence: number;
    fileLastModified: Date;
    relatedBlocks: string[]; // signatures of related blocks
}

export interface ExplorationSession {
    sessionId: string;
    startTime: Date;
    exploredBlocks: string[]; // block signatures
    navigationPath: string[]; // sequence of explored blocks
    userFeedback: Array<{
        blockSignature: string;
        rating: 'helpful' | 'neutral' | 'not_helpful';
        timestamp: Date;
    }>;
}

export interface ContextIndex {
    // File-level relationships
    fileImports: Map<string, string[]>; // file -> imported files
    fileExports: Map<string, string[]>; // file -> exported symbols

    // Block-level relationships
    functionCalls: Map<string, string[]>; // caller -> called functions
    variableUsage: Map<string, string[]>; // variable -> where it's used
    typeReferences: Map<string, string[]>; // type -> where it's referenced

    // Business logic flows
    businessFlows: Map<string, string[]>; // business operation -> related blocks
}

export class ContextMemoryManager {
    private context: vscode.ExtensionContext;
    private memoryCache = new Map<string, CodeBlockMemory>();
    private currentSession: ExplorationSession;
    private contextIndex: ContextIndex;

    // Storage keys
    private static readonly MEMORY_KEY = 'codora.blockMemory';
    private static readonly SESSION_KEY = 'codora.sessions';
    private static readonly INDEX_KEY = 'codora.contextIndex';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.currentSession = this.createNewSession();
        this.contextIndex = this.initializeContextIndex();
        this.loadMemoryFromStorage();
    }

    /**
     * Store AI analysis result with intelligent caching
     */
    public async storeAnalysis(
        block: SemanticBlock,
        analysis: AIAnalysisResult,
        fileUri: string
    ): Promise<void> {
        try {
            const signature = this.generateBlockSignature(block, fileUri);
            const fileStats = await vscode.workspace.fs.stat(vscode.Uri.parse(fileUri));

            const memory: CodeBlockMemory = {
                fileUri,
                blockSignature: signature,
                blockType: block.type,
                blockName: block.name,
                lastAnalyzed: new Date(),
                aiAnalysis: analysis,
                userInteractions: this.getExistingInteractions(signature),
                confidence: this.calculateConfidence(analysis),
                fileLastModified: new Date(fileStats.mtime),
                relatedBlocks: await this.findRelatedBlocks(block, fileUri)
            };

            this.memoryCache.set(signature, memory);
            await this.saveMemoryToStorage();

            // Update context index
            this.updateContextIndex(block, analysis, fileUri);

            console.log(`🧠 Stored analysis for ${block.name} with confidence ${memory.confidence}`);
        } catch (error) {
            console.error('🧠 Failed to store analysis:', error);
        }
    }

    /**
     * Retrieve cached analysis if available and still valid
     */
    public async retrieveAnalysis(
        block: SemanticBlock,
        fileUri: string
    ): Promise<AIAnalysisResult | null> {
        try {
            const signature = this.generateBlockSignature(block, fileUri);
            const memory = this.memoryCache.get(signature);

            if (!memory) {
                return null;
            }

            // Check if file has been modified since last analysis
            const fileStats = await vscode.workspace.fs.stat(vscode.Uri.parse(fileUri));
            const fileModified = new Date(fileStats.mtime);

            if (fileModified > memory.fileLastModified) {
                console.log(`🧠 File modified since analysis, invalidating cache for ${block.name}`);
                this.memoryCache.delete(signature);
                await this.saveMemoryToStorage();
                return null;
            }

            // Update interaction count
            memory.userInteractions++;
            this.memoryCache.set(signature, memory);

            console.log(`🧠 Retrieved cached analysis for ${block.name} (${memory.userInteractions} interactions)`);
            return memory.aiAnalysis;

        } catch (error) {
            console.error('🧠 Failed to retrieve analysis:', error);
            return null;
        }
    }

    /**
     * Find related code blocks based on relationships
     */
    public getRelatedBlocks(blockSignature: string): CodeBlockMemory[] {
        const memory = this.memoryCache.get(blockSignature);
        if (!memory || !memory.relatedBlocks) {
            return [];
        }

        return memory.relatedBlocks
            .map(sig => this.memoryCache.get(sig))
            .filter((mem): mem is CodeBlockMemory => mem !== undefined)
            .sort((a, b) => b.userInteractions - a.userInteractions);
    }

    /**
     * Get exploration history for current session
     */
    public getExplorationHistory(): ExplorationSession {
        return { ...this.currentSession };
    }

    /**
     * Record user exploration of a block
     */
    public recordExploration(block: SemanticBlock, fileUri: string): void {
        const signature = this.generateBlockSignature(block, fileUri);

        // Add to current session
        if (!this.currentSession.exploredBlocks.includes(signature)) {
            this.currentSession.exploredBlocks.push(signature);
        }
        this.currentSession.navigationPath.push(signature);

        // Update memory interaction count
        const memory = this.memoryCache.get(signature);
        if (memory) {
            memory.userInteractions++;
            this.memoryCache.set(signature, memory);
        }
    }

    /**
     * Record user feedback on analysis quality
     */
    public recordFeedback(
        block: SemanticBlock,
        fileUri: string,
        rating: 'helpful' | 'neutral' | 'not_helpful'
    ): void {
        const signature = this.generateBlockSignature(block, fileUri);

        this.currentSession.userFeedback.push({
            blockSignature: signature,
            rating,
            timestamp: new Date()
        });

        // Adjust confidence based on feedback
        const memory = this.memoryCache.get(signature);
        if (memory) {
            memory.confidence = this.adjustConfidenceBasedOnFeedback(memory.confidence, rating);
            this.memoryCache.set(signature, memory);
        }

        console.log(`🧠 Recorded ${rating} feedback for ${block.name}`);
    }

    /**
     * Get frequently accessed blocks for quick navigation
     */
    public getMostAccessedBlocks(limit: number = 10): CodeBlockMemory[] {
        return Array.from(this.memoryCache.values())
            .sort((a, b) => b.userInteractions - a.userInteractions)
            .slice(0, limit);
    }

    /**
     * Find blocks by business logic category
     */
    public getBlocksByBusinessCategory(category: string): CodeBlockMemory[] {
        return Array.from(this.memoryCache.values())
            .filter(memory =>
                memory.aiAnalysis.businessLogic.toLowerCase().includes(category.toLowerCase()) ||
                memory.aiAnalysis.purpose.toLowerCase().includes(category.toLowerCase())
            )
            .sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Clear expired or low-confidence cache entries
     */
    public async cleanupCache(): Promise<void> {
        const now = new Date();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        const minConfidence = 0.3;

        const toDelete: string[] = [];

        this.memoryCache.forEach((memory, signature) => {
            const age = now.getTime() - memory.lastAnalyzed.getTime();

            if (age > maxAge || (memory.confidence < minConfidence && memory.userInteractions === 0)) {
                toDelete.push(signature);
            }
        });

        toDelete.forEach(signature => this.memoryCache.delete(signature));

        if (toDelete.length > 0) {
            await this.saveMemoryToStorage();
            console.log(`🧠 Cleaned up ${toDelete.length} expired cache entries`);
        }
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): {
        totalBlocks: number;
        totalInteractions: number;
        averageConfidence: number;
        cacheHitRate: number;
        memoryUsage: number;
    } {
        const memories = Array.from(this.memoryCache.values());
        const totalInteractions = memories.reduce((sum, m) => sum + m.userInteractions, 0);
        const averageConfidence = memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length || 0;

        return {
            totalBlocks: memories.length,
            totalInteractions,
            averageConfidence,
            cacheHitRate: this.calculateCacheHitRate(),
            memoryUsage: JSON.stringify(Array.from(this.memoryCache.entries())).length
        };
    }

    private generateBlockSignature(block: SemanticBlock, fileUri: string): string {
        // Create unique signature based on file, block type, name, and position
        const fileName = vscode.Uri.parse(fileUri).fsPath.split('/').pop() || 'unknown';
        return `${fileName}:${block.type}:${block.name}:${block.range.start.line}:${block.range.start.character}`;
    }

    private getExistingInteractions(signature: string): number {
        return this.memoryCache.get(signature)?.userInteractions || 0;
    }

    private calculateConfidence(analysis: AIAnalysisResult): number {
        // Calculate confidence based on analysis completeness and specificity
        let confidence = 0.5; // Base confidence

        // Check completeness
        if (analysis.purpose && analysis.purpose.length > 20) {confidence += 0.1;}
        if (analysis.businessLogic && analysis.businessLogic !== 'Standard operational logic') {confidence += 0.1;}
        if (analysis.functionality && analysis.functionality.length > 30) {confidence += 0.1;}
        if (analysis.parameters && analysis.parameters.length > 0) {confidence += 0.1;}
        if (analysis.dependencies && analysis.dependencies.length > 0) {confidence += 0.1;}
        if (analysis.improvements && analysis.improvements.length > 0) {confidence += 0.05;}
        if (analysis.risks && analysis.risks.length > 0) {confidence += 0.05;}

        return Math.min(confidence, 1.0);
    }

    private async findRelatedBlocks(block: SemanticBlock, fileUri: string): Promise<string[]> {
        const related: string[] = [];

        // Find blocks in the same file that might be related
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(fileUri));

            // Simple heuristic: functions that call each other or share variables
            if (block.dependencies) {
                for (const dep of block.dependencies) {
                    // Look for blocks with similar names in cache
                    this.memoryCache.forEach((memory, signature) => {
                        if (memory.blockName.includes(dep) || dep.includes(memory.blockName)) {
                            if (!related.includes(signature)) {
                                related.push(signature);
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error finding related blocks:', error);
        }

        return related.slice(0, 5); // Limit to 5 related blocks
    }

    private updateContextIndex(block: SemanticBlock, analysis: AIAnalysisResult, fileUri: string): void {
        // Update function call relationships
        if (analysis.dependencies) {
            const blockSig = this.generateBlockSignature(block, fileUri);
            const calls = this.contextIndex.functionCalls.get(blockSig) || [];

            analysis.dependencies.forEach(dep => {
                if (!calls.includes(dep.name)) {
                    calls.push(dep.name);
                }
            });

            this.contextIndex.functionCalls.set(blockSig, calls);
        }

        // Update business flow relationships
        if (analysis.businessLogic && analysis.businessLogic !== 'Standard operational logic') {
            const flowKey = analysis.businessLogic.toLowerCase();
            const blockSig = this.generateBlockSignature(block, fileUri);
            const flow = this.contextIndex.businessFlows.get(flowKey) || [];

            if (!flow.includes(blockSig)) {
                flow.push(blockSig);
            }

            this.contextIndex.businessFlows.set(flowKey, flow);
        }
    }

    private adjustConfidenceBasedOnFeedback(
        currentConfidence: number,
        rating: 'helpful' | 'neutral' | 'not_helpful'
    ): number {
        switch (rating) {
            case 'helpful':
                return Math.min(currentConfidence + 0.1, 1.0);
            case 'not_helpful':
                return Math.max(currentConfidence - 0.2, 0.1);
            default:
                return currentConfidence;
        }
    }

    private calculateCacheHitRate(): number {
        // This would be calculated based on cache hits vs misses over time
        // For now, return a placeholder
        return 0.75; // 75% hit rate
    }

    private createNewSession(): ExplorationSession {
        return {
            sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: new Date(),
            exploredBlocks: [],
            navigationPath: [],
            userFeedback: []
        };
    }

    private initializeContextIndex(): ContextIndex {
        return {
            fileImports: new Map(),
            fileExports: new Map(),
            functionCalls: new Map(),
            variableUsage: new Map(),
            typeReferences: new Map(),
            businessFlows: new Map()
        };
    }

    private async loadMemoryFromStorage(): Promise<void> {
        try {
            const storedMemory = this.context.workspaceState.get<Array<[string, CodeBlockMemory]>>(
                ContextMemoryManager.MEMORY_KEY,
                []
            );

            this.memoryCache = new Map(storedMemory.map(([sig, memory]) => [
                sig,
                {
                    ...memory,
                    lastAnalyzed: new Date(memory.lastAnalyzed),
                    fileLastModified: new Date(memory.fileLastModified)
                }
            ]));

            console.log(`🧠 Loaded ${this.memoryCache.size} cached analyses from storage`);
        } catch (error) {
            console.error('🧠 Failed to load memory from storage:', error);
        }
    }

    private async saveMemoryToStorage(): Promise<void> {
        try {
            const memoryArray = Array.from(this.memoryCache.entries());
            await this.context.workspaceState.update(ContextMemoryManager.MEMORY_KEY, memoryArray);

            // Also save current session
            const sessions = this.context.workspaceState.get<ExplorationSession[]>(
                ContextMemoryManager.SESSION_KEY,
                []
            );
            sessions.push(this.currentSession);
            await this.context.workspaceState.update(ContextMemoryManager.SESSION_KEY, sessions.slice(-10)); // Keep last 10 sessions

        } catch (error) {
            console.error('🧠 Failed to save memory to storage:', error);
        }
    }

    public dispose(): void {
        // Save current session before disposal
        this.saveMemoryToStorage().catch(error => {
            console.error('🧠 Failed to save memory on disposal:', error);
        });
    }
}