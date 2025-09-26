# Codora AI-First Architecture

## Overview

Codora has been completely refactored to use a fully AI-powered approach for code analysis. The previous AST (Abstract Syntax Tree) analyzer has been removed in favor of intelligent AI-driven code understanding.

## Key Changes

### 1. Removed AST Analyzer
- **Why**: AST analysis was redundant - visual inspection by developers is faster and more intuitive
- **What**: Completely removed `src/astAnalyzer.ts` and all related dependencies
- **Result**: Simplified architecture with no local parsing overhead

### 2. Dual API Key System

Codora now supports intelligent model selection based on code complexity:

#### Configuration Options
```json
{
  "codora.aiService.provider": "dual",
  "codora.aiService.efficiencyApiKey": "your-efficiency-api-key",
  "codora.aiService.performanceApiKey": "your-performance-api-key",
  "codora.aiService.efficiencyModel": "gpt-3.5-turbo",
  "codora.aiService.performanceModel": "gpt-4",
  "codora.aiService.complexityThreshold": 0.6
}
```

#### Smart Model Selection
- **Simple code** (complexity < 0.6) → Efficiency model (e.g., GPT-3.5-turbo)
- **Complex code** (complexity ≥ 0.6) → Performance model (e.g., GPT-4)
- **Fallback behavior**: If only one API key is provided, use that model for all analysis

### 3. Code Complexity Analysis

The system analyzes code complexity using multiple factors:

- **Code length** (lines and characters)
- **Nesting depth** (braces, indentation levels)
- **Complex patterns** (async/await, promises, generics, decorators)
- **Language-specific complexity** (TypeScript > JavaScript > HTML)
- **Function/method count**
- **Context keywords** (algorithm, performance, security)

Complexity score: `0.0` (simple) to `1.0` (very complex)

## Architecture Components

### AIManager (Enhanced)
- **Dual provider system** with efficiency/performance providers
- **Intelligent model selection** based on complexity analysis
- **Cost optimization** with budget tracking and caching
- **Configuration management** for dual API keys

### WebviewPanel (Refactored)
- **AI-powered line analysis** replacing AST parsing
- **Context-aware explanations** using surrounding code
- **Async/await pattern** for proper promise handling
- **Error resilience** with graceful fallbacks

### Configuration Schema (Updated)
New settings for dual API key system:
- `efficiencyApiKey` - For simple code analysis
- `performanceApiKey` - For complex code analysis
- `efficiencyModel` - Cost-effective model (default: gpt-3.5-turbo)
- `performanceModel` - High-performance model (default: gpt-4)
- `complexityThreshold` - Switching point (default: 0.6)

## Benefits

### 1. Cost Optimization
- Use expensive models only for complex code
- Automatic budget tracking and limits
- Caching to reduce API calls

### 2. Better Analysis Quality
- AI understands business context better than AST
- Natural language explanations
- Context-aware code understanding

### 3. Simplified Architecture
- No local parsing dependencies
- Reduced complexity and maintenance
- Better error handling and resilience

### 4. Flexible Configuration
- Support for different providers (OpenAI, Anthropic, local)
- Granular control over model selection
- Easy migration from single to dual provider setup

## Migration Guide

### From Single API Key
1. Keep existing `apiKey` setting (will be used as fallback)
2. Optionally add `efficiencyApiKey` and `performanceApiKey`
3. Set `provider` to `"dual"` to enable intelligent routing

### Configuration Examples

#### Basic Setup (One API Key)
```json
{
  "codora.aiService.provider": "dual",
  "codora.aiService.apiKey": "your-api-key"
}
```

#### Optimized Setup (Two API Keys)
```json
{
  "codora.aiService.provider": "dual",
  "codora.aiService.efficiencyApiKey": "your-cheap-api-key",
  "codora.aiService.performanceApiKey": "your-premium-api-key",
  "codora.aiService.complexityThreshold": 0.7
}
```

#### Cost Control
```json
{
  "codora.aiService.budgetLimit": 25,
  "codora.aiService.preferCheaperModels": true,
  "codora.features.cacheExplanations": true
}
```

## Technical Implementation

### Complexity Scoring Algorithm
```typescript
private analyzeCodeComplexity(code: string, context: string, language: string): number {
    // 1. Code length factor (0-0.2)
    // 2. Line count factor (0-0.1)
    // 3. Nesting level (0-0.15)
    // 4. Complex patterns (0-0.25)
    // 5. Language-specific (0-0.1)
    // 6. Function/method count (0-0.1)
    // 7. Context complexity (0-0.15)

    return Math.min(Math.max(complexityScore, 0.0), 1.0);
}
```

### AI-Powered Line Analysis
```typescript
private async getAIPoweredLineAnalysis(
    document: vscode.TextDocument,
    lineNumber: number
): Promise<LineInfo> {
    const code = this.getContextualCode(document, lineNumber);
    const explanation = await this.aiManager.generateExplanation(
        code,
        'line analysis',
        document.languageId
    );

    return this.parseAIResponse(explanation, lineNumber);
}
```

## Future Enhancements

1. **Machine Learning**: Train custom models on codebase patterns
2. **Team Learning**: Share complexity insights across team members
3. **Integration**: Connect with code review tools and CI/CD pipelines
4. **Analytics**: Track model performance and cost optimization