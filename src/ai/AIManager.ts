/**
 * AI Manager - Central coordination for AI providers and cost optimization
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequest, AIResponse, OpenAIProvider, AnthropicProvider, LocalProvider } from './AIProvider';
import { CacheManager } from './CacheManager';
import { CostTracker } from './CostTracker';

export interface AIConfiguration {
    provider: 'openai' | 'anthropic' | 'local' | 'dual';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    enableCaching?: boolean;
    // Dual API key system
    efficiencyApiKey?: string;
    performanceApiKey?: string;
    efficiencyModel?: string;
    performanceModel?: string;
    complexityThreshold?: number;
    costOptimization?: {
        budgetLimit?: number;
        preferCheaperModels?: boolean;
        enableBatching?: boolean;
    };
}

export class AIManager {
    private providers: Map<string, AIProvider> = new Map();
    private efficiencyProvider?: AIProvider;
    private performanceProvider?: AIProvider;
    private cacheManager: CacheManager;
    private costTracker: CostTracker;
    private currentProvider?: AIProvider;
    private configuration: AIConfiguration;

    constructor(context: vscode.ExtensionContext) {
        this.cacheManager = new CacheManager(context);
        this.costTracker = new CostTracker(context);
        this.configuration = this.loadConfiguration();
        this.initializeProviders();
    }

    private loadConfiguration(): AIConfiguration {
        const config = vscode.workspace.getConfiguration('codora');

        return {
            provider: config.get('aiService.provider', 'dual') as 'openai' | 'anthropic' | 'local' | 'dual',
            model: config.get('aiService.model'),
            apiKey: config.get('aiService.apiKey'),
            baseUrl: config.get('aiService.baseUrl'),
            maxTokens: config.get('aiService.maxTokens', 1000),
            temperature: config.get('aiService.temperature', 0.7),
            enableCaching: config.get('features.cacheExplanations', true),
            // Dual API key configuration
            efficiencyApiKey: config.get('aiService.efficiencyApiKey'),
            performanceApiKey: config.get('aiService.performanceApiKey'),
            efficiencyModel: config.get('aiService.efficiencyModel', 'gpt-3.5-turbo'),
            performanceModel: config.get('aiService.performanceModel', 'gpt-4'),
            complexityThreshold: config.get('aiService.complexityThreshold', 0.6),
            costOptimization: {
                budgetLimit: config.get('aiService.budgetLimit', 10), // $10 default
                preferCheaperModels: config.get('aiService.preferCheaperModels', true),
                enableBatching: config.get('aiService.enableBatching', false)
            }
        };
    }

    private initializeProviders(): void {
        const config = this.configuration;

        // Initialize Dual Provider System
        if (config.provider === 'dual') {
            this.initializeDualProviders();
            return;
        }

        // Initialize Single Provider (original behavior)
        // Initialize OpenAI provider
        if (config.apiKey) {
            try {
                const openaiProvider = new OpenAIProvider(config.apiKey, config.baseUrl);
                if (openaiProvider.validateConfiguration()) {
                    this.providers.set('openai', openaiProvider);
                    console.log('🗺️ OpenAI provider initialized successfully');
                }
            } catch (error) {
                console.warn('🗺️ Failed to initialize OpenAI provider:', error);
            }
        }

        // Initialize Anthropic provider
        const anthropicKey = vscode.workspace.getConfiguration('codora').get<string>('aiService.anthropicKey');
        if (anthropicKey) {
            try {
                const anthropicProvider = new AnthropicProvider(anthropicKey);
                if (anthropicProvider.validateConfiguration()) {
                    this.providers.set('anthropic', anthropicProvider);
                    console.log('🗺️ Anthropic provider initialized successfully');
                }
            } catch (error) {
                console.warn('🗺️ Failed to initialize Anthropic provider:', error);
            }
        }

        // Initialize local provider
        const localUrl = config.baseUrl || 'http://localhost:11434';
        try {
            const localProvider = new LocalProvider(localUrl);
            this.providers.set('local', localProvider);
            console.log('🗺️ Local provider initialized successfully');
        } catch (error) {
            console.warn('🗺️ Failed to initialize Local provider:', error);
        }

        // Set current provider
        this.currentProvider = this.providers.get(config.provider);
        if (!this.currentProvider) {
            console.warn(`🗺️ Configured provider '${config.provider}' not available, falling back to first available`);
            this.currentProvider = Array.from(this.providers.values())[0];
        }
    }

    private initializeDualProviders(): void {
        const config = this.configuration;

        console.log('🗺️ Initializing dual provider system...');

        // Initialize efficiency provider (for simple code analysis)
        if (config.efficiencyApiKey) {
            try {
                const efficiencyProvider = new OpenAIProvider(config.efficiencyApiKey, config.baseUrl);
                if (efficiencyProvider.validateConfiguration()) {
                    this.efficiencyProvider = efficiencyProvider;
                    console.log(`🗺️ Efficiency provider initialized: ${config.efficiencyModel}`);
                }
            } catch (error) {
                console.warn('🗺️ Failed to initialize efficiency provider:', error);
            }
        }

        // Initialize performance provider (for complex code analysis)
        if (config.performanceApiKey) {
            try {
                const performanceProvider = new OpenAIProvider(config.performanceApiKey, config.baseUrl);
                if (performanceProvider.validateConfiguration()) {
                    this.performanceProvider = performanceProvider;
                    console.log(`🗺️ Performance provider initialized: ${config.performanceModel}`);
                }
            } catch (error) {
                console.warn('🗺️ Failed to initialize performance provider:', error);
            }
        }

        // Fallback to single provider if only one is available
        if (!this.efficiencyProvider && !this.performanceProvider) {
            console.warn('🗺️ No dual providers available, falling back to single provider mode');
            // Try using the regular apiKey for both
            if (config.apiKey) {
                const fallbackProvider = new OpenAIProvider(config.apiKey, config.baseUrl);
                this.efficiencyProvider = fallbackProvider;
                this.performanceProvider = fallbackProvider;
                this.currentProvider = fallbackProvider;
            }
        } else if (!this.efficiencyProvider) {
            console.log('🗺️ Only performance provider available, using it for all requests');
            this.efficiencyProvider = this.performanceProvider;
            this.currentProvider = this.performanceProvider;
        } else if (!this.performanceProvider) {
            console.log('🗺️ Only efficiency provider available, using it for all requests');
            this.performanceProvider = this.efficiencyProvider;
            this.currentProvider = this.efficiencyProvider;
        } else {
            console.log('🗺️ Both efficiency and performance providers available');
            this.currentProvider = this.efficiencyProvider; // Default to efficiency
        }
    }

    public async generateExplanation(code: string, context: string, language: string): Promise<string> {
        // Use intelligent model selection for dual provider mode
        if (this.configuration.provider === 'dual' && this.efficiencyProvider && this.performanceProvider) {
            const complexity = this.analyzeCodeComplexity(code, context, language);
            const threshold = this.configuration.complexityThreshold || 0.6;

            const selectedProvider = complexity >= threshold ? this.performanceProvider : this.efficiencyProvider;
            const selectedModel = complexity >= threshold ?
                this.configuration.performanceModel :
                this.configuration.efficiencyModel;

            console.log(`🧠 Code complexity: ${(complexity * 100).toFixed(1)}% | Using ${complexity >= threshold ? 'performance' : 'efficiency'} model (${selectedModel})`);

            return this.generateWithProvider(selectedProvider, selectedModel, code, context, language);
        }

        // Fallback to current provider for non-dual mode
        if (!this.currentProvider) {
            throw new Error('No AI provider available. Please configure API keys in settings.');
        }

        return this.generateWithProvider(this.currentProvider, this.configuration.model, code, context, language);
    }

    private async generateWithProvider(
        provider: AIProvider,
        model: string | undefined,
        code: string,
        context: string,
        language: string
    ): Promise<string> {
        // Check budget before making request
        if (!this.costTracker.canMakeRequest()) {
            throw new Error('Budget limit reached. Please adjust settings or reset budget.');
        }

        // Create cache key
        const cacheKey = this.cacheManager.createCacheKey(code, context, language);

        // Check cache first
        if (this.configuration.enableCaching) {
            const cached = this.cacheManager.get(cacheKey);
            if (cached) {
                console.log('🗺️ Using cached explanation');
                return cached;
            }
        }

        // Prepare AI request
        const request: AIRequest = {
            messages: [
                {
                    role: 'system',
                    content: this.createSystemPrompt(language)
                },
                {
                    role: 'user',
                    content: this.createUserPrompt(code, context)
                }
            ],
            model: model || 'gpt-3.5-turbo',
            maxTokens: this.configuration.maxTokens,
            temperature: this.configuration.temperature,
            cacheKey
        };

        try {
            const response = await provider.generateResponse(request);

            // Track cost
            this.costTracker.recordUsage(response.cost, response.tokens.total, response.provider, response.model);

            // Cache response
            if (this.configuration.enableCaching) {
                this.cacheManager.set(cacheKey, response.content);
            }

            console.log(`🗺️ AI explanation generated - Cost: $${response.cost.toFixed(4)}, Tokens: ${response.tokens.total}`);

            return response.content;
        } catch (error) {
            console.error('🗺️ Failed to generate AI explanation:', error);
            throw new Error(`AI request failed: ${error}`);
        }
    }

    /**
     * Analyze code complexity to determine which model to use
     * Returns a complexity score from 0.0 (simple) to 1.0 (very complex)
     */
    private analyzeCodeComplexity(code: string, context: string, language: string): number {
        let complexityScore = 0.0;

        // Basic complexity indicators
        const lines = code.split('\n').filter(line => line.trim().length > 0);
        const codeLength = code.length;

        // 1. Code length factor (0-0.2)
        if (codeLength > 1000) {
            complexityScore += 0.2;
        } else if (codeLength > 500) {
            complexityScore += 0.15;
        } else if (codeLength > 200) {
            complexityScore += 0.1;
        } else if (codeLength > 50) {
            complexityScore += 0.05;
        }

        // 2. Line count factor (0-0.1)
        if (lines.length > 50) {
            complexityScore += 0.1;
        } else if (lines.length > 20) {
            complexityScore += 0.05;
        }

        // 3. Nesting level (0-0.15)
        const maxNesting = this.calculateMaxNesting(code);
        if (maxNesting > 5) {
            complexityScore += 0.15;
        } else if (maxNesting > 3) {
            complexityScore += 0.1;
        } else if (maxNesting > 2) {
            complexityScore += 0.05;
        }

        // 4. Complex patterns (0-0.25)
        const complexPatterns = [
            /async\s+function|await/g,           // Async/await patterns
            /Promise\.|\.then\(|\.catch\(/g,     // Promise chains
            /class\s+\w+.*extends|implements/g,  // OOP inheritance
            /interface\s+\w+|type\s+\w+\s*=/g,   // Type definitions
            /generic.*<.*>|<T.*>/g,              // Generics
            /decorator|@\w+/g,                   // Decorators
            /regex|\/.*\/[gim]*/g,               // Regular expressions
            /try\s*{|catch\s*\(|finally\s*{/g,   // Error handling
            /switch\s*\(|case\s+.*:|default:/g,  // Switch statements
            /for\s*\(.*in\s|for\s*\(.*of\s/g,    // Advanced loops
        ];

        complexPatterns.forEach(pattern => {
            const matches = code.match(pattern);
            if (matches) {
                complexityScore += Math.min(matches.length * 0.05, 0.25);
            }
        });

        // 5. Language-specific complexity (0-0.1)
        switch (language.toLowerCase()) {
            case 'typescript':
            case 'rust':
            case 'c++':
                complexityScore += 0.1; // These languages tend to be more complex
                break;
            case 'python':
            case 'javascript':
                complexityScore += 0.05; // Moderate complexity
                break;
            case 'html':
            case 'css':
            case 'json':
                complexityScore += 0.0; // Usually simple
                break;
        }

        // 6. Function/method count (0-0.1)
        const functionMatches = code.match(/function\s+\w+|=>\s*{|method\s+\w+/g);
        if (functionMatches && functionMatches.length > 5) {
            complexityScore += 0.1;
        } else if (functionMatches && functionMatches.length > 2) {
            complexityScore += 0.05;
        }

        // 7. Context complexity (0-0.15)
        if (context.toLowerCase().includes('algorithm') ||
            context.toLowerCase().includes('optimization') ||
            context.toLowerCase().includes('performance') ||
            context.toLowerCase().includes('security') ||
            context.toLowerCase().includes('architecture')) {
            complexityScore += 0.15;
        } else if (context.toLowerCase().includes('logic') ||
                   context.toLowerCase().includes('business') ||
                   context.toLowerCase().includes('complex')) {
            complexityScore += 0.1;
        }

        // Ensure score is between 0 and 1
        return Math.min(Math.max(complexityScore, 0.0), 1.0);
    }

    private calculateMaxNesting(code: string): number {
        let maxNesting = 0;
        let currentNesting = 0;

        for (let i = 0; i < code.length; i++) {
            if (code[i] === '{') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            } else if (code[i] === '}') {
                currentNesting = Math.max(0, currentNesting - 1);
            }
        }

        return maxNesting;
    }

    private selectOptimalModel(): string {
        if (!this.currentProvider) {
            return '';
        }

        const config = this.configuration;

        // Use user-specified model if provided
        if (config.model) {
            return config.model;
        }

        // Use cost optimization
        if (config.costOptimization?.preferCheaperModels) {
            // For OpenAI, prefer GPT-3.5 over GPT-4
            if (this.currentProvider.getName() === 'OpenAI') {
                return 'gpt-3.5-turbo';
            }
            // For Anthropic, prefer Haiku over Sonnet/Opus
            if (this.currentProvider.getName() === 'Anthropic') {
                return 'claude-3-haiku-20240307';
            }
        }

        return this.currentProvider.getDefaultModel();
    }

    private createSystemPrompt(language: string): string {
        return `You are Codora, an AI code exploration assistant. Your role is to provide clear, concise explanations of code snippets to help developers understand complex codebases.

Guidelines:
- Explain the code's purpose and functionality
- Highlight key concepts, patterns, and relationships
- Use simple, accessible language
- Focus on practical understanding
- Keep responses under 200 words for hover explanations
- Consider the ${language} language context

Remember: You're like Dora the Explorer, but for code - making the complex simple and accessible!`;
    }

    private createUserPrompt(code: string, context: string): string {
        return `Please explain this ${context} code snippet:

\`\`\`
${code}
\`\`\`

Focus on:
1. What this code does
2. Key concepts or patterns used
3. How it fits into the broader codebase context

Keep the explanation concise and beginner-friendly.`;
    }

    public getUsageStats(): any {
        return this.costTracker.getStats();
    }

    public getCacheStats(): any {
        return this.cacheManager.getStats();
    }

    public getProviderStatus(): { [key: string]: boolean } {
        const status: { [key: string]: boolean } = {};
        this.providers.forEach((provider, name) => {
            status[name] = provider.validateConfiguration();
        });
        return status;
    }

    public switchProvider(providerName: string): boolean {
        const provider = this.providers.get(providerName);
        if (provider && provider.validateConfiguration()) {
            this.currentProvider = provider;
            console.log(`🗺️ Switched to ${providerName} provider`);
            return true;
        }
        return false;
    }

    public clearCache(): void {
        this.cacheManager.clear();
    }

    public resetBudget(): void {
        this.costTracker.resetBudget();
    }

    public refreshConfiguration(): void {
        this.configuration = this.loadConfiguration();
        this.initializeProviders();
    }
}