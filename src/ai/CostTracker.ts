/**
 * Cost Tracker - Monitors AI usage and costs to prevent budget overruns
 */

import * as vscode from 'vscode';

export interface UsageRecord {
    timestamp: number;
    cost: number;
    tokens: number;
    provider: string;
    model: string;
    requestType: string;
}

export interface CostStats {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    averageCostPerRequest: number;
    averageTokensPerRequest: number;
    dailyCost: number;
    weeklyCost: number;
    monthlyCost: number;
    budgetUsed: number;
    budgetRemaining: number;
    topProviders: Array<{provider: string, cost: number, requests: number}>;
    topModels: Array<{model: string, cost: number, requests: number}>;
}

export class CostTracker {
    private context: vscode.ExtensionContext;
    private usageHistory: UsageRecord[] = [];
    private budgetLimit: number;
    private budgetPeriod: 'daily' | 'weekly' | 'monthly' = 'monthly';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadUsageHistory();
        this.budgetLimit = this.getBudgetLimit();
        this.cleanupOldRecords();
    }

    public recordUsage(cost: number, tokens: number, provider: string, model: string, requestType: string = 'explanation'): void {
        const record: UsageRecord = {
            timestamp: Date.now(),
            cost,
            tokens,
            provider,
            model,
            requestType
        };

        this.usageHistory.push(record);
        this.saveUsageHistory();

        console.log(`🗺️ Usage recorded: ${provider}/${model} - $${cost.toFixed(4)} (${tokens} tokens)`);

        // Check if approaching budget limit
        const currentPeriodCost = this.getCurrentPeriodCost();
        const warningThreshold = this.budgetLimit * 0.8; // 80% of budget

        if (currentPeriodCost >= this.budgetLimit) {
            vscode.window.showWarningMessage(
                `🗺️ Codora: Budget limit ($${this.budgetLimit}) reached! Consider adjusting settings or upgrading.`,
                'Open Settings', 'View Usage'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'codora.aiService');
                }
            });
        } else if (currentPeriodCost >= warningThreshold) {
            vscode.window.showInformationMessage(
                `🗺️ Codora: ${Math.round((currentPeriodCost / this.budgetLimit) * 100)}% of budget used ($${currentPeriodCost.toFixed(2)}/$${this.budgetLimit})`,
                'View Usage'
            );
        }
    }

    public canMakeRequest(): boolean {
        const currentCost = this.getCurrentPeriodCost();
        return currentCost < this.budgetLimit;
    }

    public getStats(): CostStats {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

        const totalCost = this.usageHistory.reduce((sum, record) => sum + record.cost, 0);
        const totalTokens = this.usageHistory.reduce((sum, record) => sum + record.tokens, 0);
        const totalRequests = this.usageHistory.length;

        const dailyCost = this.usageHistory
            .filter(record => record.timestamp > oneDayAgo)
            .reduce((sum, record) => sum + record.cost, 0);

        const weeklyCost = this.usageHistory
            .filter(record => record.timestamp > oneWeekAgo)
            .reduce((sum, record) => sum + record.cost, 0);

        const monthlyCost = this.usageHistory
            .filter(record => record.timestamp > oneMonthAgo)
            .reduce((sum, record) => sum + record.cost, 0);

        const currentPeriodCost = this.getCurrentPeriodCost();

        // Calculate provider statistics
        const providerStats = new Map<string, {cost: number, requests: number}>();
        const modelStats = new Map<string, {cost: number, requests: number}>();

        this.usageHistory.forEach(record => {
            // Provider stats
            const providerStat = providerStats.get(record.provider) || {cost: 0, requests: 0};
            providerStat.cost += record.cost;
            providerStat.requests += 1;
            providerStats.set(record.provider, providerStat);

            // Model stats
            const modelStat = modelStats.get(record.model) || {cost: 0, requests: 0};
            modelStat.cost += record.cost;
            modelStat.requests += 1;
            modelStats.set(record.model, modelStat);
        });

        const topProviders = Array.from(providerStats.entries())
            .map(([provider, stats]) => ({provider, cost: stats.cost, requests: stats.requests}))
            .sort((a, b) => b.cost - a.cost);

        const topModels = Array.from(modelStats.entries())
            .map(([model, stats]) => ({model, cost: stats.cost, requests: stats.requests}))
            .sort((a, b) => b.cost - a.cost);

        return {
            totalCost,
            totalTokens,
            totalRequests,
            averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
            averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
            dailyCost,
            weeklyCost,
            monthlyCost,
            budgetUsed: currentPeriodCost,
            budgetRemaining: Math.max(0, this.budgetLimit - currentPeriodCost),
            topProviders: topProviders.slice(0, 5),
            topModels: topModels.slice(0, 5)
        };
    }

    public resetBudget(): void {
        const config = vscode.workspace.getConfiguration('codora');
        const resetType = config.get('aiService.budgetResetType', 'clear') as 'clear' | 'archive';

        if (resetType === 'clear') {
            this.usageHistory = [];
            console.log('🗺️ Usage history cleared and budget reset');
        } else {
            // Archive old records but keep them for historical analysis
            const archiveKey = `codora.usageArchive.${Date.now()}`;
            this.context.globalState.update(archiveKey, this.usageHistory);
            this.usageHistory = [];
            console.log('🗺️ Usage history archived and budget reset');
        }

        this.saveUsageHistory();
        vscode.window.showInformationMessage('🗺️ Codora: Budget has been reset!');
    }

    public exportUsageData(): string {
        const stats = this.getStats();
        const exportData = {
            generatedAt: new Date().toISOString(),
            summary: stats,
            detailedHistory: this.usageHistory.map(record => ({
                ...record,
                timestamp: new Date(record.timestamp).toISOString()
            }))
        };

        return JSON.stringify(exportData, null, 2);
    }

    private getCurrentPeriodCost(): number {
        const now = Date.now();
        let periodStart: number;

        switch (this.budgetPeriod) {
            case 'daily':
                periodStart = now - (24 * 60 * 60 * 1000);
                break;
            case 'weekly':
                periodStart = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
            default:
                periodStart = now - (30 * 24 * 60 * 60 * 1000);
                break;
        }

        return this.usageHistory
            .filter(record => record.timestamp > periodStart)
            .reduce((sum, record) => sum + record.cost, 0);
    }

    private getBudgetLimit(): number {
        const config = vscode.workspace.getConfiguration('codora');
        return config.get('aiService.budgetLimit', 10); // Default $10
    }

    private loadUsageHistory(): void {
        try {
            const history = this.context.globalState.get('codora.usageHistory', []);
            this.usageHistory = Array.isArray(history) ? history : [];
            console.log(`🗺️ Loaded ${this.usageHistory.length} usage records from storage`);
        } catch (error) {
            console.warn('🗺️ Failed to load usage history:', error);
            this.usageHistory = [];
        }
    }

    private saveUsageHistory(): void {
        try {
            // Keep only recent records to prevent storage bloat
            const maxRecords = 10000;
            if (this.usageHistory.length > maxRecords) {
                this.usageHistory = this.usageHistory.slice(-maxRecords);
            }

            this.context.globalState.update('codora.usageHistory', this.usageHistory);
        } catch (error) {
            console.warn('🗺️ Failed to save usage history:', error);
        }
    }

    private cleanupOldRecords(): void {
        const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
        const initialCount = this.usageHistory.length;

        this.usageHistory = this.usageHistory.filter(record => record.timestamp > sixMonthsAgo);

        const removedCount = initialCount - this.usageHistory.length;
        if (removedCount > 0) {
            console.log(`🗺️ Cleaned up ${removedCount} old usage records (older than 6 months)`);
            this.saveUsageHistory();
        }
    }

    public getCostBreakdown(days: number = 30): Array<{date: string, cost: number, requests: number}> {
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const dailyData = new Map<string, {cost: number, requests: number}>();

        this.usageHistory
            .filter(record => record.timestamp > startTime)
            .forEach(record => {
                const date = new Date(record.timestamp).toISOString().split('T')[0];
                const dayData = dailyData.get(date) || {cost: 0, requests: 0};
                dayData.cost += record.cost;
                dayData.requests += 1;
                dailyData.set(date, dayData);
            });

        return Array.from(dailyData.entries())
            .map(([date, data]) => ({date, ...data}))
            .sort((a, b) => a.date.localeCompare(b.date));
    }
}