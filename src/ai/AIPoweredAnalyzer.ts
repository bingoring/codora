/**
 * AI-Powered Code Analyzer - Replaces static analysis with intelligent understanding
 * Uses AI to understand code purpose, business logic, and real-world functionality
 */

import * as vscode from 'vscode';
import { AIManager } from './AIManager';
import { SemanticBlock } from '../semantic/SemanticBlockAnalyzer';
import { ContextMemoryManager } from '../memory/ContextMemoryManager';

export interface AIAnalysisResult {
    purpose: string;
    businessLogic: string;
    functionality: string;
    parameters: Array<{
        name: string;
        purpose: string;
        type?: string;
        importance: 'critical' | 'important' | 'optional';
    }>;
    returns: {
        description: string;
        businessMeaning: string;
        type?: string;
    };
    dependencies: Array<{
        name: string;
        purpose: string;
        category: 'database' | 'api' | 'service' | 'utility' | 'business';
        criticalPath: boolean;
    }>;
    complexity: {
        level: 'simple' | 'moderate' | 'complex' | 'very-complex';
        reasoning: string;
        mainChallenges: string[];
    };
    businessImpact: {
        level: 'low' | 'medium' | 'high' | 'critical';
        reasoning: string;
        affectedAreas: string[];
    };
    codeFlow: {
        mainSteps: string[];
        decisionPoints: string[];
        errorHandling: string[];
    };
    improvements: string[];
    relatedConcepts: string[];
    risks: string[];
}

export class AIPoweredAnalyzer {
    private aiManager: AIManager;
    private contextMemory: ContextMemoryManager;
    private analysisCache = new Map<string, AIAnalysisResult>(); // Short-term cache

    constructor(aiManager: AIManager, contextMemory: ContextMemoryManager) {
        this.aiManager = aiManager;
        this.contextMemory = contextMemory;
    }

    /**
     * Perform comprehensive AI analysis of a code block
     */
    public async analyzeCodeBlock(block: SemanticBlock, context?: {
        surroundingCode?: string;
        fileName?: string;
        projectContext?: string;
    }): Promise<AIAnalysisResult> {

        const fileUri = context?.fileName || '';

        // Check persistent memory first
        const cachedAnalysis = await this.contextMemory.retrieveAnalysis(block, fileUri);
        if (cachedAnalysis) {
            console.log('🧠 Using persistent memory analysis');
            this.contextMemory.recordExploration(block, fileUri);
            return cachedAnalysis;
        }

        const cacheKey = this.createCacheKey(block, context);

        // Check short-term cache
        if (this.analysisCache.has(cacheKey)) {
            console.log('🗺️ Using short-term cached AI analysis');
            return this.analysisCache.get(cacheKey)!;
        }

        try {
            console.log(`🗺️ Performing AI analysis of ${block.type}: ${block.name}`);

            const analysisPrompt = this.createAnalysisPrompt(block, context);
            const aiResponse = await this.aiManager.generateExplanation(
                block.fullText,
                analysisPrompt,
                context?.fileName ? this.getLanguageFromFileName(context.fileName) : 'typescript'
            );

            const analysis = this.parseAIResponse(aiResponse, block);

            // Cache the result in both short-term and persistent memory
            this.analysisCache.set(cacheKey, analysis);
            await this.contextMemory.storeAnalysis(block, analysis, fileUri);

            console.log(`🗺️ AI analysis completed for ${block.name}`);
            return analysis;

        } catch (error) {
            console.error('🗺️ AI analysis failed:', error);
            return this.createFallbackAnalysis(block);
        }
    }

    /**
     * Quick AI analysis for hover interactions
     */
    public async getQuickInsight(block: SemanticBlock): Promise<string> {
        try {
            const prompt = this.createQuickInsightPrompt(block);
            const insight = await this.aiManager.generateExplanation(
                block.fullText,
                prompt,
                'typescript'
            );

            return insight;
        } catch (error) {
            console.error('🗺️ Quick insight failed:', error);
            return this.generateStaticInsight(block);
        }
    }

    /**
     * Analyze method calls with business context
     */
    public async analyzeMethodCall(methodCall: string, context: {
        parentFunction?: string;
        surroundingCode?: string;
        fileName?: string;
    }): Promise<{
        purpose: string;
        businessMeaning: string;
        expectedBehavior: string;
        potentialIssues: string[];
    }> {
        try {
            const prompt = `
You are analyzing a method call in a software system. Provide business-focused insights.

Method Call: ${methodCall}
Context: ${context.parentFunction ? `Called within ${context.parentFunction}` : 'Unknown context'}
File: ${context.fileName || 'Unknown'}

${context.surroundingCode ? `Surrounding Code:\n${context.surroundingCode}` : ''}

Please analyze:
1. What business operation does this method call perform?
2. What is its purpose in real-world terms?
3. What should a developer expect this to do?
4. What could go wrong or needs attention?

Format as JSON:
{
    "purpose": "Brief technical purpose",
    "businessMeaning": "What this means for the business/user",
    "expectedBehavior": "What should happen when this runs",
    "potentialIssues": ["potential issue 1", "potential issue 2"]
}`;

            const response = await this.aiManager.generateExplanation(methodCall, prompt, 'typescript');

            try {
                return JSON.parse(response);
            } catch {
                // Fallback parsing
                return {
                    purpose: response.substring(0, 100),
                    businessMeaning: `Performs ${methodCall.split('.').pop()} operation`,
                    expectedBehavior: "Executes the method and returns result",
                    potentialIssues: ["May throw exceptions if parameters are invalid"]
                };
            }

        } catch (error) {
            console.error('🗺️ Method call analysis failed:', error);
            return {
                purpose: `Executes ${methodCall}`,
                businessMeaning: `Performs ${methodCall.split('.').pop()} functionality`,
                expectedBehavior: "Method execution with expected results",
                potentialIssues: ["Check for proper error handling"]
            };
        }
    }

    private createAnalysisPrompt(block: SemanticBlock, context?: any): string {
        return `
You are a senior software architect analyzing code for a developer. Provide comprehensive, practical insights.

Code Block Type: ${block.type}
Name: ${block.name}
${context?.fileName ? `File: ${context.fileName}` : ''}
${context?.projectContext ? `Project Context: ${context.projectContext}` : ''}

Code to Analyze:
\`\`\`
${block.fullText}
\`\`\`

${context?.surroundingCode ? `Surrounding Code Context:\n\`\`\`\n${context.surroundingCode}\n\`\`\`` : ''}

Please provide a comprehensive analysis focusing on practical understanding:

1. **Purpose**: What does this code actually DO in simple terms?
2. **Business Logic**: How does this relate to real-world business operations?
3. **Functionality**: Step-by-step what happens when this executes?
4. **Parameters**: For each parameter, explain its real purpose and importance
5. **Returns**: What does the return value represent in business terms?
6. **Dependencies**: What external systems/services does this interact with?
7. **Complexity**: Why is this complex or simple? What makes it challenging?
8. **Business Impact**: How critical is this code to the overall system?
9. **Code Flow**: What are the main execution steps?
10. **Improvements**: What could be better about this code?
11. **Risks**: What could go wrong or needs attention?

Be practical and focus on helping developers understand the real-world impact and functionality.
Format as JSON with clear, actionable insights.`;
    }

    private createQuickInsightPrompt(block: SemanticBlock): string {
        return `
Provide a quick, practical insight about this code block in 1-2 sentences.

Code Type: ${block.type}
Code: ${block.fullText}

Focus on:
- What it actually does in business/functional terms
- Why a developer would care about this code
- Any immediate insights about its purpose

Keep it concise but informative - like a helpful colleague explaining the code.`;
    }

    private parseAIResponse(response: string, block: SemanticBlock): AIAnalysisResult {
        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(response);
            return this.validateAndNormalizeAnalysis(parsed, block);
        } catch {
            // Fallback: parse structured text response
            return this.parseStructuredTextResponse(response, block);
        }
    }

    private parseStructuredTextResponse(response: string, block: SemanticBlock): AIAnalysisResult {
        // Extract insights from text response using patterns
        const lines = response.split('\n');
        const result: Partial<AIAnalysisResult> = {};

        let currentSection = '';
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.includes('purpose:')) {
                result.purpose = line.split(':').slice(1).join(':').trim();
            } else if (lower.includes('business logic:')) {
                result.businessLogic = line.split(':').slice(1).join(':').trim();
            } else if (lower.includes('functionality:')) {
                result.functionality = line.split(':').slice(1).join(':').trim();
            }
        }

        return this.createCompleteAnalysis(result, block);
    }

    private validateAndNormalizeAnalysis(parsed: any, block: SemanticBlock): AIAnalysisResult {
        return {
            purpose: parsed.purpose || `Handles ${block.name} functionality`,
            businessLogic: parsed.businessLogic || 'Standard operational logic',
            functionality: parsed.functionality || `Executes ${block.type} operations`,
            parameters: parsed.parameters || [],
            returns: parsed.returns || { description: 'Standard return value', businessMeaning: 'Result of operation' },
            dependencies: parsed.dependencies || [],
            complexity: parsed.complexity || { level: 'moderate', reasoning: 'Standard complexity', mainChallenges: [] },
            businessImpact: parsed.businessImpact || { level: 'medium', reasoning: 'Standard business impact', affectedAreas: [] },
            codeFlow: parsed.codeFlow || { mainSteps: [], decisionPoints: [], errorHandling: [] },
            improvements: parsed.improvements || [],
            relatedConcepts: parsed.relatedConcepts || [],
            risks: parsed.risks || []
        };
    }

    private createCompleteAnalysis(partial: Partial<AIAnalysisResult>, block: SemanticBlock): AIAnalysisResult {
        return {
            purpose: partial.purpose || `Handles ${block.name} operations`,
            businessLogic: partial.businessLogic || 'Core business functionality',
            functionality: partial.functionality || `Performs ${block.type} tasks`,
            parameters: partial.parameters || [],
            returns: partial.returns || { description: 'Operation result', businessMeaning: 'Computed value' },
            dependencies: partial.dependencies || [],
            complexity: partial.complexity || { level: 'moderate', reasoning: 'Standard implementation', mainChallenges: [] },
            businessImpact: partial.businessImpact || { level: 'medium', reasoning: 'Important system component', affectedAreas: [] },
            codeFlow: partial.codeFlow || { mainSteps: ['Execute main logic'], decisionPoints: [], errorHandling: [] },
            improvements: partial.improvements || [],
            relatedConcepts: partial.relatedConcepts || [],
            risks: partial.risks || []
        };
    }

    private createFallbackAnalysis(block: SemanticBlock): AIAnalysisResult {
        return {
            purpose: `Executes ${block.name} functionality`,
            businessLogic: 'Standard business operations',
            functionality: `Performs ${block.type} tasks as defined`,
            parameters: [],
            returns: { description: 'Function result', businessMeaning: 'Calculated output' },
            dependencies: [],
            complexity: { level: 'moderate', reasoning: 'Standard implementation complexity', mainChallenges: [] },
            businessImpact: { level: 'medium', reasoning: 'Standard business component', affectedAreas: [] },
            codeFlow: { mainSteps: ['Execute primary logic'], decisionPoints: [], errorHandling: [] },
            improvements: ['Consider adding comprehensive error handling'],
            relatedConcepts: [],
            risks: ['Verify input validation and error handling']
        };
    }

    private generateStaticInsight(block: SemanticBlock): string {
        const insights: Record<SemanticBlock['type'], string> = {
            'function': `Function ${block.name} - handles specific computational logic`,
            'method': `Method ${block.name} - performs operations on the parent object`,
            'method-call': `Calls ${block.name} - likely handles business operations or external services`,
            'class': `Class ${block.name} - defines data structure and related behaviors`,
            'variable': `Variable ${block.name} - stores data for use in current context`,
            'property-access': `Accesses ${block.name} - retrieves data from object properties`,
            'import': `Import ${block.name} - brings external module functionality into current scope`,
            'type-definition': `Type ${block.name} - defines data structure and constraints`
        };

        return insights[block.type] || `Code block ${block.name} handles system functionality`;
    }

    private createCacheKey(block: SemanticBlock, context?: any): string {
        const contextKey = context ? JSON.stringify(context) : '';
        return `${block.type}-${block.name}-${block.fullText.length}-${contextKey}`.replace(/\s/g, '');
    }

    private getLanguageFromFileName(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'ts': 'typescript',
            'js': 'javascript',
            'py': 'python',
            'java': 'java',
            'cs': 'csharp',
            'cpp': 'cpp',
            'c': 'c'
        };
        return langMap[ext || ''] || 'typescript';
    }

    /**
     * Get related code blocks for enhanced navigation
     */
    public getRelatedBlocks(block: SemanticBlock, fileUri: string): Promise<any[]> {
        const blockSignature = this.createBlockSignature(block, fileUri);
        return Promise.resolve(this.contextMemory.getRelatedBlocks(blockSignature));
    }

    /**
     * Get exploration history for context awareness
     */
    public getExplorationHistory() {
        return this.contextMemory.getExplorationHistory();
    }

    /**
     * Record user feedback on analysis quality
     */
    public recordFeedback(
        block: SemanticBlock,
        fileUri: string,
        rating: 'helpful' | 'neutral' | 'not_helpful'
    ): void {
        this.contextMemory.recordFeedback(block, fileUri, rating);
    }

    /**
     * Get frequently accessed blocks for quick navigation
     */
    public getMostAccessedBlocks(limit?: number): any[] {
        return this.contextMemory.getMostAccessedBlocks(limit);
    }

    /**
     * Find blocks by business logic category
     */
    public getBlocksByBusinessCategory(category: string): any[] {
        return this.contextMemory.getBlocksByBusinessCategory(category);
    }

    /**
     * Get comprehensive cache stats including persistent memory
     */
    public getCacheStats() {
        const memoryStats = this.contextMemory.getCacheStats();
        return {
            shortTerm: {
                size: this.analysisCache.size,
                keys: Array.from(this.analysisCache.keys())
            },
            persistent: memoryStats
        };
    }

    public clearCache(): void {
        this.analysisCache.clear();
        console.log('🗺️ AI analysis cache cleared');
    }

    /**
     * Create block signature for memory operations
     */
    private createBlockSignature(block: SemanticBlock, fileUri: string): string {
        const fileName = fileUri.split('/').pop() || 'unknown';
        return `${fileName}:${block.type}:${block.name}:${block.range.start.line}:${block.range.start.character}`;
    }
}