/**
 * Cache Manager - Handles AI response caching to reduce costs
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';

export interface CacheEntry {
    content: string;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
}

export interface CacheStats {
    totalEntries: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    sizeBytes: number;
    oldestEntry: number;
    newestEntry: number;
}

export class CacheManager {
    private cache: Map<string, CacheEntry> = new Map();
    private context: vscode.ExtensionContext;
    private maxCacheSize = 1000; // Maximum number of cache entries
    private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    private stats = {
        hits: 0,
        misses: 0
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadCacheFromStorage();
        this.setupCleanupTimer();
    }

    public createCacheKey(code: string, context: string, language: string): string {
        const normalizedCode = code.trim().replace(/\s+/g, ' ');
        const data = `${normalizedCode}|${context}|${language}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    public get(key: string): string | null {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if entry is expired
        const now = Date.now();
        if (now - entry.timestamp > this.maxAge) {
            this.cache.delete(key);
            this.saveCacheToStorage();
            this.stats.misses++;
            return null;
        }

        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = now;
        this.stats.hits++;

        return entry.content;
    }

    public set(key: string, content: string): void {
        const now = Date.now();

        // If cache is at capacity, remove least recently used entries
        if (this.cache.size >= this.maxCacheSize) {
            this.evictLeastRecentlyUsed();
        }

        const entry: CacheEntry = {
            content,
            timestamp: now,
            accessCount: 1,
            lastAccessed: now
        };

        this.cache.set(key, entry);
        this.saveCacheToStorage();
    }

    public clear(): void {
        this.cache.clear();
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.saveCacheToStorage();
        console.log('🗺️ Cache cleared');
    }

    public getStats(): CacheStats {
        const entries = Array.from(this.cache.values());
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

        const timestamps = entries.map(e => e.timestamp);
        const sizeBytes = this.calculateCacheSize();

        return {
            totalEntries: this.cache.size,
            hitRate: Math.round(hitRate * 100) / 100,
            totalHits: this.stats.hits,
            totalMisses: this.stats.misses,
            sizeBytes,
            oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
            newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0
        };
    }

    private evictLeastRecentlyUsed(): void {
        if (this.cache.size === 0) {
            return;
        }

        let oldestKey = '';
        let oldestTime = Date.now();

        this.cache.forEach((entry, key) => {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        });

        if (oldestKey) {
            this.cache.delete(oldestKey);
            console.log(`🗺️ Evicted cache entry (LRU): ${oldestKey.substring(0, 8)}...`);
        }
    }

    private cleanupExpiredEntries(): void {
        const now = Date.now();
        let removedCount = 0;

        this.cache.forEach((entry, key) => {
            if (now - entry.timestamp > this.maxAge) {
                this.cache.delete(key);
                removedCount++;
            }
        });

        if (removedCount > 0) {
            console.log(`🗺️ Cleaned up ${removedCount} expired cache entries`);
            this.saveCacheToStorage();
        }
    }

    private setupCleanupTimer(): void {
        // Clean up expired entries every hour
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 60 * 60 * 1000);
    }

    private loadCacheFromStorage(): void {
        try {
            const cacheData = this.context.globalState.get('codora.cache', {});
            const statsData = this.context.globalState.get('codora.cacheStats', { hits: 0, misses: 0 });

            // Convert plain object back to Map
            if (cacheData && typeof cacheData === 'object') {
                Object.entries(cacheData).forEach(([key, value]) => {
                    this.cache.set(key, value as CacheEntry);
                });
                console.log(`🗺️ Loaded ${this.cache.size} cache entries from storage`);
            }

            this.stats = statsData as { hits: number; misses: number };
        } catch (error) {
            console.warn('🗺️ Failed to load cache from storage:', error);
        }
    }

    private saveCacheToStorage(): void {
        try {
            // Convert Map to plain object for storage
            const cacheData: { [key: string]: CacheEntry } = {};
            this.cache.forEach((value, key) => {
                cacheData[key] = value;
            });

            this.context.globalState.update('codora.cache', cacheData);
            this.context.globalState.update('codora.cacheStats', this.stats);
        } catch (error) {
            console.warn('🗺️ Failed to save cache to storage:', error);
        }
    }

    private calculateCacheSize(): number {
        let totalSize = 0;
        this.cache.forEach(entry => {
            totalSize += JSON.stringify(entry).length * 2; // Approximate bytes (UTF-16)
        });
        return totalSize;
    }

    public getCacheInfo(key: string): CacheEntry | null {
        return this.cache.get(key) || null;
    }

    public getTopAccessedEntries(limit: number = 10): Array<{key: string, entry: CacheEntry}> {
        return Array.from(this.cache.entries())
            .map(([key, entry]) => ({key, entry}))
            .sort((a, b) => b.entry.accessCount - a.entry.accessCount)
            .slice(0, limit);
    }
}