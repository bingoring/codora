/**
 * Semantic Block Analyzer - Identifies meaningful code blocks for analysis
 * Replaces line-by-line analysis with semantic understanding
 */

import * as vscode from 'vscode';
import { AIPoweredAnalyzer, AIAnalysisResult } from '../ai/AIPoweredAnalyzer';

export interface SemanticBlock {
    type: 'function' | 'method' | 'class' | 'variable' | 'method-call' | 'property-access' | 'import' | 'type-definition';
    name: string;
    range: vscode.Range;
    fullText: string;
    context: string;
    purpose?: string; // AI-generated purpose
    parameters?: Array<{name: string, type?: string, description?: string}>;
    returnType?: string;
    dependencies?: string[];
    parentBlock?: SemanticBlock;
    childBlocks?: SemanticBlock[];
    metadata: {
        complexity: 'low' | 'medium' | 'high';
        importance: 'low' | 'medium' | 'high';
        businessLogic: boolean;
        hasExternalDependencies: boolean;
    };
}

export class SemanticBlockAnalyzer {
    private aiAnalyzer: AIPoweredAnalyzer;

    constructor(aiAnalyzer: AIPoweredAnalyzer) {
        this.aiAnalyzer = aiAnalyzer;
    }

    /**
     * Find the most specific semantic block at the given position with AI-enhanced analysis
     * This is used for Cmd+Shift hover interaction
     */
    public async findBlockAt(document: vscode.TextDocument, position: vscode.Position): Promise<SemanticBlock | null> {
        try {
            // Get all document symbols first
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return this.fallbackAnalysis(document, position);
            }

            // Find the most specific block containing the position
            const block = this.findMostSpecificBlock(symbols, position, document);
            if (block) {
                // Enhance with AI analysis
                return await this.enhanceBlockWithAI(block, document);
            }
            return block;
        } catch (error) {
            console.error('🗺️ Error in semantic analysis:', error);
            return this.fallbackAnalysis(document, position);
        }
    }

    /**
     * Get all semantic blocks in a document for comprehensive analysis
     */
    public async analyzeDocument(document: vscode.TextDocument): Promise<SemanticBlock[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return [];
            }

            return this.processSymbolHierarchy(symbols, document);
        } catch (error) {
            console.error('🗺️ Error analyzing document:', error);
            return [];
        }
    }

    private findMostSpecificBlock(
        symbols: vscode.DocumentSymbol[],
        position: vscode.Position,
        document: vscode.TextDocument,
        parent?: SemanticBlock
    ): SemanticBlock | null {

        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                // Check if we're in a child symbol first
                if (symbol.children && symbol.children.length > 0) {
                    const parentBlock = this.symbolToSemanticBlock(symbol, document, parent);
                    const childBlock = this.findMostSpecificBlock(symbol.children, position, document, parentBlock);
                    if (childBlock) {
                        return childBlock;
                    }
                }

                // Check if we're on a specific expression within the symbol
                const expressionBlock = this.findExpressionAt(symbol, position, document, parent);
                if (expressionBlock) {
                    return expressionBlock;
                }

                // Return the symbol itself as a block
                return this.symbolToSemanticBlock(symbol, document, parent);
            }
        }

        return null;
    }

    private findExpressionAt(
        symbol: vscode.DocumentSymbol,
        position: vscode.Position,
        document: vscode.TextDocument,
        parent?: SemanticBlock
    ): SemanticBlock | null {

        const line = document.lineAt(position.line);
        const text = line.text;
        const character = position.character;

        // Method call detection (e.g., orderService.processOrder())
        const methodCallMatch = this.findMethodCallAt(text, character);
        if (methodCallMatch) {
            return {
                type: 'method-call',
                name: methodCallMatch.fullCall,
                range: new vscode.Range(
                    position.line, methodCallMatch.start,
                    position.line, methodCallMatch.end
                ),
                fullText: methodCallMatch.fullCall,
                context: `Method call within ${symbol.name}`,
                metadata: {
                    complexity: 'medium',
                    importance: 'high',
                    businessLogic: this.isBusinessLogicCall(methodCallMatch.fullCall),
                    hasExternalDependencies: this.hasExternalDependencies(methodCallMatch.fullCall)
                },
                parentBlock: parent
            };
        }

        // Property access detection (e.g., user.profile.email)
        const propertyMatch = this.findPropertyAccessAt(text, character);
        if (propertyMatch) {
            return {
                type: 'property-access',
                name: propertyMatch.fullAccess,
                range: new vscode.Range(
                    position.line, propertyMatch.start,
                    position.line, propertyMatch.end
                ),
                fullText: propertyMatch.fullAccess,
                context: `Property access within ${symbol.name}`,
                metadata: {
                    complexity: 'low',
                    importance: 'medium',
                    businessLogic: false,
                    hasExternalDependencies: false
                },
                parentBlock: parent
            };
        }

        // Variable assignment detection
        const variableMatch = this.findVariableAt(text, character);
        if (variableMatch) {
            return {
                type: 'variable',
                name: variableMatch.name,
                range: new vscode.Range(
                    position.line, variableMatch.start,
                    position.line, variableMatch.end
                ),
                fullText: variableMatch.fullText,
                context: `Variable within ${symbol.name}`,
                metadata: {
                    complexity: 'low',
                    importance: 'medium',
                    businessLogic: false,
                    hasExternalDependencies: false
                },
                parentBlock: parent
            };
        }

        return null;
    }

    private findMethodCallAt(text: string, position: number): {fullCall: string, start: number, end: number} | null {
        // Pattern: object.method() or service.method(params)
        const methodCallRegex = /(\w+(?:\.\w+)*)\s*\([^)]*\)/g;
        let match;

        while ((match = methodCallRegex.exec(text)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;

            if (position >= start && position <= end) {
                return {
                    fullCall: match[0].trim(),
                    start,
                    end
                };
            }
        }

        return null;
    }

    private findPropertyAccessAt(text: string, position: number): {fullAccess: string, start: number, end: number} | null {
        // Pattern: object.property or object.property.subproperty
        const propertyRegex = /\w+(?:\.\w+)+(?!\s*\()/g;
        let match;

        while ((match = propertyRegex.exec(text)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;

            if (position >= start && position <= end) {
                return {
                    fullAccess: match[0],
                    start,
                    end
                };
            }
        }

        return null;
    }

    private findVariableAt(text: string, position: number): {name: string, fullText: string, start: number, end: number} | null {
        // Pattern: const/let/var name = value
        const variableRegex = /(const|let|var)\s+(\w+)\s*=\s*([^;]+)/g;
        let match;

        while ((match = variableRegex.exec(text)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;

            if (position >= start && position <= end) {
                return {
                    name: match[2],
                    fullText: match[0],
                    start,
                    end
                };
            }
        }

        return null;
    }

    private symbolToSemanticBlock(symbol: vscode.DocumentSymbol, document: vscode.TextDocument, parent?: SemanticBlock): SemanticBlock {
        const fullText = document.getText(symbol.range);

        return {
            type: this.mapSymbolKindToBlockType(symbol.kind),
            name: symbol.name,
            range: symbol.range,
            fullText: fullText,
            context: parent ? `Within ${parent.name}` : 'Top-level',
            parameters: this.extractParameters(fullText, symbol.kind),
            returnType: this.extractReturnType(fullText, symbol.kind),
            dependencies: this.extractDependencies(fullText),
            parentBlock: parent,
            metadata: {
                complexity: this.assessComplexity(fullText),
                importance: this.assessImportance(symbol.kind, symbol.name),
                businessLogic: this.isBusinessLogic(symbol.name, fullText),
                hasExternalDependencies: this.hasExternalDependencies(fullText)
            }
        };
    }

    private mapSymbolKindToBlockType(kind: vscode.SymbolKind): SemanticBlock['type'] {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return 'function';
            case vscode.SymbolKind.Method:
                return 'method';
            case vscode.SymbolKind.Class:
                return 'class';
            case vscode.SymbolKind.Variable:
            case vscode.SymbolKind.Constant:
                return 'variable';
            case vscode.SymbolKind.Interface:
            case vscode.SymbolKind.TypeParameter:
                return 'type-definition';
            default:
                return 'function';
        }
    }

    private extractParameters(text: string, kind: vscode.SymbolKind): Array<{name: string, type?: string}> {
        if (kind !== vscode.SymbolKind.Function && kind !== vscode.SymbolKind.Method) {
            return [];
        }

        // Extract parameters from function/method signature
        const paramMatch = text.match(/\(([^)]*)\)/);
        if (!paramMatch) {return [];}

        const params = paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
        return params.map(param => {
            const [name, type] = param.split(':').map(s => s.trim());
            return { name, type };
        });
    }

    private extractReturnType(text: string, kind: vscode.SymbolKind): string | undefined {
        if (kind !== vscode.SymbolKind.Function && kind !== vscode.SymbolKind.Method) {
            return undefined;
        }

        // Extract return type from TypeScript function signature
        const returnMatch = text.match(/\):\s*([^{]+)/);
        return returnMatch ? returnMatch[1].trim() : undefined;
    }

    private extractDependencies(text: string): string[] {
        const dependencies: string[] = [];

        // Find method calls
        const methodCalls = text.match(/\w+\.\w+\(/g) || [];
        methodCalls.forEach(call => {
            const service = call.split('.')[0];
            if (service && !dependencies.includes(service)) {
                dependencies.push(service);
            }
        });

        return dependencies;
    }

    private assessComplexity(text: string): 'low' | 'medium' | 'high' {
        const lines = text.split('\n').length;
        const complexity = (text.match(/if|for|while|switch|try|catch/g) || []).length;

        if (lines > 20 || complexity > 3) {return 'high';}
        if (lines > 10 || complexity > 1) {return 'medium';}
        return 'low';
    }

    private assessImportance(kind: vscode.SymbolKind, name: string): 'low' | 'medium' | 'high' {
        const importantKeywords = ['main', 'init', 'process', 'handle', 'execute', 'run'];
        const lowImportanceKeywords = ['helper', 'util', 'format', 'parse'];

        const lowerName = name.toLowerCase();

        if (importantKeywords.some(keyword => lowerName.includes(keyword))) {
            return 'high';
        }

        if (lowImportanceKeywords.some(keyword => lowerName.includes(keyword))) {
            return 'low';
        }

        if (kind === vscode.SymbolKind.Class || kind === vscode.SymbolKind.Interface) {
            return 'high';
        }

        return 'medium';
    }

    private isBusinessLogic(name: string, text: string): boolean {
        const businessKeywords = ['order', 'payment', 'user', 'account', 'process', 'calculate', 'validate', 'auth'];
        const lowerContent = (name + ' ' + text).toLowerCase();

        return businessKeywords.some(keyword => lowerContent.includes(keyword));
    }

    private isBusinessLogicCall(callText: string): boolean {
        const businessKeywords = ['process', 'calculate', 'validate', 'auth', 'pay', 'order', 'create', 'update', 'delete'];
        const lowerCall = callText.toLowerCase();

        return businessKeywords.some(keyword => lowerCall.includes(keyword));
    }

    private hasExternalDependencies(text: string): boolean {
        // Check for common external service patterns
        const externalPatterns = ['service', 'api', 'client', 'repository', 'dao', 'http', 'fetch'];
        const lowerText = text.toLowerCase();

        return externalPatterns.some(pattern => lowerText.includes(pattern));
    }

    private processSymbolHierarchy(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument, parent?: SemanticBlock): SemanticBlock[] {
        const blocks: SemanticBlock[] = [];

        for (const symbol of symbols) {
            const block = this.symbolToSemanticBlock(symbol, document, parent);

            if (symbol.children && symbol.children.length > 0) {
                block.childBlocks = this.processSymbolHierarchy(symbol.children, document, block);
            }

            blocks.push(block);
        }

        return blocks;
    }

    private fallbackAnalysis(document: vscode.TextDocument, position: vscode.Position): SemanticBlock | null {
        // Fallback when LSP symbols aren't available
        const line = document.lineAt(position.line);
        const text = line.text;

        if (text.trim().length === 0) {
            return null;
        }

        return {
            type: 'function', // Default type
            name: text.trim().substring(0, 20) + '...',
            range: line.range,
            fullText: text,
            context: 'Code snippet',
            metadata: {
                complexity: 'low',
                importance: 'medium',
                businessLogic: false,
                hasExternalDependencies: false
            }
        };
    }

    /**
     * Enhance a semantic block with AI-powered analysis
     * Replaces static analysis with intelligent understanding
     */
    private async enhanceBlockWithAI(block: SemanticBlock, document: vscode.TextDocument): Promise<SemanticBlock> {
        try {
            console.log(`🧠 Enhancing ${block.name} with AI analysis...`);

            // Get surrounding context for better analysis
            const surroundingContext = this.getSurroundingContext(block, document);

            // Use AI to analyze the block
            const aiAnalysis = await this.aiAnalyzer.analyzeCodeBlock(block, {
                surroundingCode: surroundingContext,
                fileName: document.fileName,
                projectContext: 'VS Code Extension Development'
            });

            // Enhance the block with AI insights
            return {
                ...block,
                purpose: aiAnalysis.purpose,
                parameters: this.enhanceParametersWithAI(block.parameters || [], aiAnalysis.parameters),
                dependencies: aiAnalysis.dependencies.map(dep => dep.name),
                metadata: {
                    complexity: this.mapAIComplexityToBlockComplexity(aiAnalysis.complexity.level),
                    importance: this.mapAIBusinessImpactToImportance(aiAnalysis.businessImpact.level),
                    businessLogic: aiAnalysis.businessLogic !== 'Standard operational logic',
                    hasExternalDependencies: aiAnalysis.dependencies.some(dep => dep.category === 'api' || dep.category === 'service' || dep.category === 'database')
                }
            };

        } catch (error) {
            console.error('🧠 AI enhancement failed, using fallback:', error);
            // Return original block if AI analysis fails
            return block;
        }
    }

    /**
     * Get surrounding code context for better AI analysis
     */
    private getSurroundingContext(block: SemanticBlock, document: vscode.TextDocument): string {
        const startLine = Math.max(0, block.range.start.line - 3);
        const endLine = Math.min(document.lineCount - 1, block.range.end.line + 3);

        const contextRange = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, document.lineAt(endLine).text.length)
        );

        return document.getText(contextRange);
    }

    /**
     * Enhance parameters with AI insights
     */
    private enhanceParametersWithAI(
        originalParams: Array<{name: string, type?: string}>,
        aiParams: AIAnalysisResult['parameters']
    ): Array<{name: string, type?: string, description?: string}> {
        return originalParams.map(param => {
            const aiParam = aiParams.find(ap => ap.name === param.name);
            return {
                ...param,
                description: aiParam?.purpose
            };
        });
    }

    /**
     * Map AI complexity levels to semantic block complexity
     */
    private mapAIComplexityToBlockComplexity(aiComplexity: 'simple' | 'moderate' | 'complex' | 'very-complex'): 'low' | 'medium' | 'high' {
        switch (aiComplexity) {
            case 'simple': return 'low';
            case 'moderate': return 'medium';
            case 'complex':
            case 'very-complex': return 'high';
            default: return 'medium';
        }
    }

    /**
     * Map AI business impact to block importance
     */
    private mapAIBusinessImpactToImportance(businessImpact: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' {
        switch (businessImpact) {
            case 'low': return 'low';
            case 'medium': return 'medium';
            case 'high':
            case 'critical': return 'high';
            default: return 'medium';
        }
    }
}