/**
 * AI Provider Abstraction Layer
 * Supports multiple AI providers with unified interface
 */

import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

// Simple fetch implementation for Node.js
function fetch(urlString: string, options: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlString);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = client.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode! >= 200 && res.statusCode! < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    json: () => Promise.resolve(JSON.parse(data)),
                    text: () => Promise.resolve(data)
                });
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

export interface AIResponse {
    content: string;
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost: number; // in USD
    provider: string;
    model: string;
    cached: boolean;
}

export interface AIRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    cacheKey?: string;
}

export abstract class AIProvider {
    protected name: string;
    protected apiKey: string;
    protected baseUrl?: string;

    constructor(name: string, apiKey: string, baseUrl?: string) {
        this.name = name;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    abstract generateResponse(request: AIRequest): Promise<AIResponse>;
    abstract validateConfiguration(): boolean;
    abstract getAvailableModels(): string[];
    abstract calculateCost(tokens: number, model: string): number;
    abstract getDefaultModel(): string;

    getName(): string {
        return this.name;
    }
}

export class OpenAIProvider extends AIProvider {
    private models = [
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k',
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4o'
    ];

    private pricing: Record<string, { input: number; output: number }> = {
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }, // per 1K tokens
        'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
        'gpt-4o': { input: 0.005, output: 0.015 }
    };

    constructor(apiKey: string, baseUrl?: string) {
        super('OpenAI', apiKey, baseUrl || 'https://api.openai.com/v1');
    }

    async generateResponse(request: AIRequest): Promise<AIResponse> {
        const model = request.model || this.getDefaultModel();

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: request.messages,
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const usage = data.usage;
            const totalCost = this.calculateCost(usage.total_tokens, model);

            return {
                content: data.choices[0].message.content,
                tokens: {
                    prompt: usage.prompt_tokens,
                    completion: usage.completion_tokens,
                    total: usage.total_tokens
                },
                cost: totalCost,
                provider: this.name,
                model,
                cached: false
            };
        } catch (error) {
            throw new Error(`OpenAI request failed: ${error}`);
        }
    }

    validateConfiguration(): boolean {
        return !!this.apiKey && this.apiKey.length > 0;
    }

    getAvailableModels(): string[] {
        return [...this.models];
    }

    calculateCost(tokens: number, model: string): number {
        const pricing = this.pricing[model];
        if (!pricing) {
            return 0;
        }

        // Simplified cost calculation - in real implementation,
        // would separate input/output tokens
        return (tokens / 1000) * pricing.input;
    }

    getDefaultModel(): string {
        return 'gpt-3.5-turbo';
    }
}

export class AnthropicProvider extends AIProvider {
    private models = [
        'claude-3-haiku-20240307',
        'claude-3-sonnet-20240229',
        'claude-3-opus-20240229'
    ];

    private pricing: Record<string, { input: number; output: number }> = {
        'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
        'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
        'claude-3-opus-20240229': { input: 0.015, output: 0.075 }
    };

    constructor(apiKey: string) {
        super('Anthropic', apiKey, 'https://api.anthropic.com/v1');
    }

    async generateResponse(request: AIRequest): Promise<AIResponse> {
        const model = request.model || this.getDefaultModel();

        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7,
                    messages: request.messages.filter(m => m.role !== 'system'),
                    system: request.messages.find(m => m.role === 'system')?.content
                })
            });

            if (!response.ok) {
                throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const usage = data.usage;
            const totalCost = this.calculateCostDetailed(usage.input_tokens, usage.output_tokens, model);

            return {
                content: data.content[0].text,
                tokens: {
                    prompt: usage.input_tokens,
                    completion: usage.output_tokens,
                    total: usage.input_tokens + usage.output_tokens
                },
                cost: totalCost,
                provider: this.name,
                model,
                cached: false
            };
        } catch (error) {
            throw new Error(`Anthropic request failed: ${error}`);
        }
    }

    private calculateCostDetailed(inputTokens: number, outputTokens: number, model: string): number {
        const pricing = this.pricing[model];
        if (!pricing) {
            return 0;
        }

        return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    }

    validateConfiguration(): boolean {
        return !!this.apiKey && this.apiKey.length > 0;
    }

    getAvailableModels(): string[] {
        return [...this.models];
    }

    calculateCost(tokens: number, model: string): number {
        const pricing = this.pricing[model];
        if (!pricing) {
            return 0;
        }

        // Average cost approximation
        return (tokens / 1000) * ((pricing.input + pricing.output) / 2);
    }

    getDefaultModel(): string {
        return 'claude-3-haiku-20240307';
    }
}

export class LocalProvider extends AIProvider {
    private models = ['llama2', 'codellama', 'mistral', 'phi'];

    constructor(baseUrl: string = 'http://localhost:11434') {
        super('Local', '', baseUrl);
    }

    async generateResponse(request: AIRequest): Promise<AIResponse> {
        const model = request.model || this.getDefaultModel();

        try {
            // Ollama API format
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: request.messages,
                    options: {
                        temperature: request.temperature || 0.7
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Local API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            return {
                content: data.message.content,
                tokens: {
                    prompt: 0, // Local models typically don't report token usage
                    completion: 0,
                    total: 0
                },
                cost: 0, // Local models are free
                provider: this.name,
                model,
                cached: false
            };
        } catch (error) {
            throw new Error(`Local model request failed: ${error}`);
        }
    }

    validateConfiguration(): boolean {
        // For local models, just check if base URL is accessible
        return !!this.baseUrl;
    }

    getAvailableModels(): string[] {
        return [...this.models];
    }

    calculateCost(tokens: number, model: string): number {
        return 0; // Local models are free
    }

    getDefaultModel(): string {
        return 'llama2';
    }
}