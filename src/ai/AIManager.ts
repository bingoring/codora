/**
 * AI Manager - Central coordination for AI providers and cost optimization
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequest, AIResponse, OpenAIProvider, AnthropicProvider, LocalProvider } from './AIProvider';
import { CacheManager } from './CacheManager';
import { CostTracker } from './CostTracker';

export interface AIConfiguration {
    provider: 'openai' | 'anthropic' | 'local';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    enableCaching?: boolean;
    costOptimization?: {
        budgetLimit?: number;
        preferCheaperModels?: boolean;
        enableBatching?: boolean;
    };
}

export class AIManager {
    private providers: Map<string, AIProvider> = new Map();
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
            provider: config.get('aiService.provider', 'openai') as 'openai' | 'anthropic' | 'local',
            model: config.get('aiService.model'),
            apiKey: config.get('aiService.apiKey'),
            baseUrl: config.get('aiService.baseUrl'),
            maxTokens: config.get('aiService.maxTokens', 1000),
            temperature: config.get('aiService.temperature', 0.7),
            enableCaching: config.get('features.cacheExplanations', true),
            costOptimization: {
                budgetLimit: config.get('aiService.budgetLimit', 10), // $10 default
                preferCheaperModels: config.get('aiService.preferCheaperModels', true),
                enableBatching: config.get('aiService.enableBatching', false)
            }
        };
    }

    private initializeProviders(): void {
        const config = this.configuration;

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

    public async generateExplanation(code: string, context: string, language: string): Promise<string> {
        if (!this.currentProvider) {
            throw new Error('No AI provider available. Please configure API keys in settings.');
        }

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
            model: this.selectOptimalModel(),
            maxTokens: this.configuration.maxTokens,
            temperature: this.configuration.temperature,
            cacheKey
        };

        try {
            const response = await this.currentProvider.generateResponse(request);

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