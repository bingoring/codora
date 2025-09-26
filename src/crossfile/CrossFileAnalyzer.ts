/**
 * Cross-File Analyzer - Intelligent analysis of code relationships across multiple files
 * Builds on Phase 5 memory system to understand inter-file connections and data flows
 */

import * as vscode from 'vscode';
import { SemanticBlock } from '../semantic/SemanticBlockAnalyzer';
import { AIPoweredAnalyzer } from '../ai/AIPoweredAnalyzer';
import { ContextMemoryManager } from '../memory/ContextMemoryManager';

export interface FileRelationship {
    fileUri: string;
    fileName: string;
    relationship: 'imports_from' | 'exports_to' | 'calls_function' | 'shares_type' | 'extends_class' | 'implements_interface';
    relevantBlocks: Array<{
        blockName: string;
        blockType: SemanticBlock['type'];
        purpose: string;
        lineNumber: number;
    }>;
    businessConnection: string;
    confidence: number; // 0-1 confidence in the relationship
}

export interface DataFlow {
    originFile: string;
    destinationFile: string;
    originBlock: string;
    destinationBlock: string;
    dataType: string;
    transformation: string; // What happens to the data
    businessPurpose: string;
    flowDirection: 'input' | 'output' | 'bidirectional';
}

export interface CrossFileContext {
    sourceFile: string;
    sourceBlock: SemanticBlock;
    relatedFiles: FileRelationship[];
    dataFlows: DataFlow[];
    businessFlow: {
        flowName: string; // "User authentication flow"
        involvedFiles: string[];
        mainSteps: string[];
        keyDecisionPoints: string[];
    };
    navigationTrail: Array<{
        file: string;
        block: string;
        timestamp: Date;
        reason: string; // Why we navigated here
    }>;
}

export class CrossFileAnalyzer {
    private aiAnalyzer: AIPoweredAnalyzer;
    private contextMemory: ContextMemoryManager;
    private analysisCache = new Map<string, CrossFileContext>();

    constructor(aiAnalyzer: AIPoweredAnalyzer, contextMemory: ContextMemoryManager) {
        this.aiAnalyzer = aiAnalyzer;
        this.contextMemory = contextMemory;
    }

    /**
     * Analyze cross-file relationships for a given semantic block
     */
    public async analyzeRelationships(
        block: SemanticBlock,
        fileUri: string
    ): Promise<CrossFileContext> {
        try {
            const cacheKey = this.createCacheKey(block, fileUri);

            // Check cache first
            if (this.analysisCache.has(cacheKey)) {
                console.log('🌐 Using cached cross-file analysis');
                return this.analysisCache.get(cacheKey)!;
            }

            console.log(`🌐 Analyzing cross-file relationships for ${block.name} in ${fileUri}`);

            const context: CrossFileContext = {
                sourceFile: fileUri,
                sourceBlock: block,
                relatedFiles: [],
                dataFlows: [],
                businessFlow: {
                    flowName: '',
                    involvedFiles: [],
                    mainSteps: [],
                    keyDecisionPoints: []
                },
                navigationTrail: []
            };

            // 1. Find direct code relationships (imports, exports, function calls)
            const directRelationships = await this.findDirectRelationships(block, fileUri);
            context.relatedFiles.push(...directRelationships);

            // 2. Analyze semantic relationships using AI
            const semanticRelationships = await this.findSemanticRelationships(block, fileUri, directRelationships);
            context.relatedFiles.push(...semanticRelationships);

            // 3. Trace data flows
            context.dataFlows = await this.traceDataFlows(block, fileUri, context.relatedFiles);

            // 4. Identify business logic flows
            context.businessFlow = await this.identifyBusinessFlow(block, fileUri, context.relatedFiles);

            // Cache the result
            this.analysisCache.set(cacheKey, context);

            console.log(`🌐 Found ${context.relatedFiles.length} related files, ${context.dataFlows.length} data flows`);
            return context;

        } catch (error) {
            console.error('🌐 Cross-file analysis failed:', error);
            return this.createFallbackContext(block, fileUri);
        }
    }

    /**
     * Find files that directly import from or export to the current file
     */
    private async findDirectRelationships(
        block: SemanticBlock,
        fileUri: string
    ): Promise<FileRelationship[]> {
        const relationships: FileRelationship[] = [];

        try {
            // Get all workspace files
            const workspaceFiles = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java}', '**/node_modules/**');

            for (const file of workspaceFiles.slice(0, 50)) { // Limit to prevent performance issues
                if (file.toString() === fileUri) {continue;}

                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const content = document.getText();
                    const fileName = file.fsPath.split('/').pop() || 'unknown';

                    // Check for imports from current file
                    const importMatches = this.findImportStatements(content, fileUri);
                    if (importMatches.length > 0) {
                        relationships.push({
                            fileUri: file.toString(),
                            fileName,
                            relationship: 'imports_from',
                            relevantBlocks: importMatches,
                            businessConnection: `Imports functionality from ${block.name}`,
                            confidence: 0.9
                        });
                    }

                    // Check for function calls to current block
                    const callMatches = this.findFunctionCalls(content, block.name);
                    if (callMatches.length > 0) {
                        relationships.push({
                            fileUri: file.toString(),
                            fileName,
                            relationship: 'calls_function',
                            relevantBlocks: callMatches,
                            businessConnection: `Calls ${block.name} for specific operations`,
                            confidence: 0.8
                        });
                    }
                } catch (fileError) {
                    // Skip files that can't be read
                    continue;
                }
            }
        } catch (error) {
            console.error('🌐 Error finding direct relationships:', error);
        }

        return relationships;
    }

    /**
     * Use AI to find semantic relationships between files
     */
    private async findSemanticRelationships(
        block: SemanticBlock,
        fileUri: string,
        directRelationships: FileRelationship[]
    ): Promise<FileRelationship[]> {
        const semanticRelationships: FileRelationship[] = [];

        try {
            // Get related blocks from memory system
            const relatedFromMemory = await this.aiAnalyzer.getRelatedBlocks(block, fileUri);

            for (const relatedBlock of relatedFromMemory.slice(0, 10)) { // Limit for performance
                if (relatedBlock.fileUri && relatedBlock.fileUri !== fileUri) {
                    // Use AI to understand the business connection
                    const connection = await this.analyzeBusinessConnection(block, relatedBlock);

                    semanticRelationships.push({
                        fileUri: relatedBlock.fileUri,
                        fileName: relatedBlock.fileUri.split('/').pop() || 'unknown',
                        relationship: 'shares_type',
                        relevantBlocks: [{
                            blockName: relatedBlock.blockName,
                            blockType: relatedBlock.blockType,
                            purpose: relatedBlock.aiAnalysis?.purpose || 'Related functionality',
                            lineNumber: 0 // Would need to be determined from actual block
                        }],
                        businessConnection: connection,
                        confidence: relatedBlock.confidence || 0.6
                    });
                }
            }
        } catch (error) {
            console.error('🌐 Error finding semantic relationships:', error);
        }

        return semanticRelationships;
    }

    /**
     * Trace how data flows between files
     */
    private async traceDataFlows(
        block: SemanticBlock,
        fileUri: string,
        relatedFiles: FileRelationship[]
    ): Promise<DataFlow[]> {
        const dataFlows: DataFlow[] = [];

        try {
            for (const relatedFile of relatedFiles) {
                // Analyze how data moves between the current block and related files
                if (relatedFile.relationship === 'calls_function') {
                    dataFlows.push({
                        originFile: relatedFile.fileUri,
                        destinationFile: fileUri,
                        originBlock: relatedFile.relevantBlocks[0]?.blockName || 'unknown',
                        destinationBlock: block.name,
                        dataType: this.inferDataType(block),
                        transformation: `Processes input from ${relatedFile.fileName}`,
                        businessPurpose: relatedFile.businessConnection,
                        flowDirection: 'input'
                    });
                } else if (relatedFile.relationship === 'imports_from') {
                    dataFlows.push({
                        originFile: fileUri,
                        destinationFile: relatedFile.fileUri,
                        originBlock: block.name,
                        destinationBlock: relatedFile.relevantBlocks[0]?.blockName || 'unknown',
                        dataType: this.inferDataType(block),
                        transformation: `Provides functionality to ${relatedFile.fileName}`,
                        businessPurpose: relatedFile.businessConnection,
                        flowDirection: 'output'
                    });
                }
            }
        } catch (error) {
            console.error('🌐 Error tracing data flows:', error);
        }

        return dataFlows;
    }

    /**
     * Identify the business logic flow that this code participates in
     */
    private async identifyBusinessFlow(
        block: SemanticBlock,
        fileUri: string,
        relatedFiles: FileRelationship[]
    ): Promise<CrossFileContext['businessFlow']> {
        try {
            // Use AI to understand the business context
            const businessFlowName = await this.generateBusinessFlowName(block, relatedFiles);

            const involvedFiles = [fileUri, ...relatedFiles.map(f => f.fileUri)];

            // Generate main steps based on relationships
            const mainSteps = [
                `Data enters through ${block.name}`,
                ...relatedFiles.map(f => f.businessConnection),
                `Process completes with expected output`
            ];

            return {
                flowName: businessFlowName,
                involvedFiles: [...new Set(involvedFiles)], // Remove duplicates
                mainSteps,
                keyDecisionPoints: this.identifyDecisionPoints(block, relatedFiles)
            };
        } catch (error) {
            console.error('🌐 Error identifying business flow:', error);
            return {
                flowName: `${block.name} operation flow`,
                involvedFiles: [fileUri],
                mainSteps: [`Executes ${block.name}`],
                keyDecisionPoints: []
            };
        }
    }

    /**
     * Update navigation trail when user navigates to related code
     */
    public recordNavigation(
        context: CrossFileContext,
        targetFile: string,
        targetBlock: string,
        reason: string
    ): void {
        context.navigationTrail.push({
            file: targetFile,
            block: targetBlock,
            timestamp: new Date(),
            reason
        });

        // Keep only last 20 navigation steps
        if (context.navigationTrail.length > 20) {
            context.navigationTrail = context.navigationTrail.slice(-20);
        }
    }

    /**
     * Get navigation suggestions based on current context
     */
    public getNavigationSuggestions(context: CrossFileContext): Array<{
        file: string;
        block: string;
        reason: string;
        confidence: number;
    }> {
        const suggestions: Array<{file: string, block: string, reason: string, confidence: number}> = [];

        // Suggest high-confidence related files
        context.relatedFiles
            .filter(f => f.confidence > 0.7)
            .slice(0, 5)
            .forEach(file => {
                file.relevantBlocks.forEach(block => {
                    suggestions.push({
                        file: file.fileName,
                        block: block.blockName,
                        reason: file.businessConnection,
                        confidence: file.confidence
                    });
                });
            });

        // Sort by confidence and return top suggestions
        return suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 8);
    }

    // Helper methods
    private findImportStatements(content: string, targetFileUri: string): Array<{
        blockName: string;
        blockType: SemanticBlock['type'];
        purpose: string;
        lineNumber: number;
    }> {
        const imports: Array<{blockName: string, blockType: SemanticBlock['type'], purpose: string, lineNumber: number}> = [];
        const lines = content.split('\n');
        const targetFileName = targetFileUri.split('/').pop()?.replace(/\.(ts|js|tsx|jsx)$/, '') || '';

        lines.forEach((line, index) => {
            if (line.includes('import') && line.includes(targetFileName)) {
                imports.push({
                    blockName: 'import statement',
                    blockType: 'import',
                    purpose: `Imports from ${targetFileName}`,
                    lineNumber: index + 1
                });
            }
        });

        return imports;
    }

    private findFunctionCalls(content: string, functionName: string): Array<{
        blockName: string;
        blockType: SemanticBlock['type'];
        purpose: string;
        lineNumber: number;
    }> {
        const calls: Array<{blockName: string, blockType: SemanticBlock['type'], purpose: string, lineNumber: number}> = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (line.includes(`${functionName}(`)) {
                calls.push({
                    blockName: functionName,
                    blockType: 'method-call',
                    purpose: `Calls ${functionName}`,
                    lineNumber: index + 1
                });
            }
        });

        return calls;
    }

    private async analyzeBusinessConnection(sourceBlock: SemanticBlock, relatedBlock: any): Promise<string> {
        try {
            // Use AI to understand business connection
            const prompt = `Analyze the business relationship between these code blocks:

Source: ${sourceBlock.name} (${sourceBlock.purpose || 'No description'})
Related: ${relatedBlock.blockName} (${relatedBlock.aiAnalysis?.purpose || 'No description'})

Provide a brief explanation of how they work together in business terms.`;

            // This would be enhanced with actual AI analysis
            return `Related to ${sourceBlock.name} through shared business logic`;
        } catch {
            return `Shares functionality with ${sourceBlock.name}`;
        }
    }

    private async generateBusinessFlowName(block: SemanticBlock, relatedFiles: FileRelationship[]): Promise<string> {
        // Generate meaningful business flow name based on block purpose and relationships
        if (block.purpose && block.purpose.toLowerCase().includes('auth')) {
            return 'User Authentication Flow';
        }
        if (block.purpose && block.purpose.toLowerCase().includes('order')) {
            return 'Order Processing Flow';
        }
        if (block.purpose && block.purpose.toLowerCase().includes('payment')) {
            return 'Payment Processing Flow';
        }

        return `${block.name} Business Flow`;
    }

    private identifyDecisionPoints(block: SemanticBlock, relatedFiles: FileRelationship[]): string[] {
        const decisions: string[] = [];

        if (block.fullText.includes('if') || block.fullText.includes('switch')) {
            decisions.push(`Decision logic in ${block.name}`);
        }

        relatedFiles.forEach(file => {
            if (file.relationship === 'calls_function') {
                decisions.push(`Function call decision in ${file.fileName}`);
            }
        });

        return decisions;
    }

    private inferDataType(block: SemanticBlock): string {
        // Infer data type from block information
        if (block.parameters && block.parameters.length > 0) {
            return block.parameters[0].type || 'mixed';
        }
        if (block.returnType) {
            return block.returnType;
        }
        return 'unknown';
    }

    private createCacheKey(block: SemanticBlock, fileUri: string): string {
        return `${fileUri}:${block.name}:${block.range.start.line}`;
    }

    private createFallbackContext(block: SemanticBlock, fileUri: string): CrossFileContext {
        return {
            sourceFile: fileUri,
            sourceBlock: block,
            relatedFiles: [],
            dataFlows: [],
            businessFlow: {
                flowName: `${block.name} operation`,
                involvedFiles: [fileUri],
                mainSteps: [`Execute ${block.name}`],
                keyDecisionPoints: []
            },
            navigationTrail: []
        };
    }

    /**
     * Clean up analysis cache
     */
    public clearCache(): void {
        this.analysisCache.clear();
        console.log('🌐 Cross-file analysis cache cleared');
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): {
        entries: number;
        totalRelationships: number;
        averageRelatedFiles: number;
    } {
        const contexts = Array.from(this.analysisCache.values());
        const totalRelationships = contexts.reduce((sum, ctx) => sum + ctx.relatedFiles.length, 0);

        return {
            entries: contexts.length,
            totalRelationships,
            averageRelatedFiles: contexts.length > 0 ? totalRelationships / contexts.length : 0
        };
    }
}