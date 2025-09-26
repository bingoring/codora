import * as vscode from 'vscode';
import { CodoraHoverProvider } from './hoverProvider';
import { CodoraWebviewPanel } from './webviewPanel';
import { SymbolExtractor } from './symbolExtractor';
import { AIManager } from './ai/AIManager';
import { AIPoweredAnalyzer } from './ai/AIPoweredAnalyzer';
import { ContextMemoryManager } from './memory/ContextMemoryManager';
import { SemanticBlockAnalyzer } from './semantic/SemanticBlockAnalyzer';
import { CrossFileAnalyzer } from './crossfile/CrossFileAnalyzer';
import { IntelligentNavigator } from './crossfile/IntelligentNavigator';
import { ContextPreservationManager } from './crossfile/ContextPreservationManager';
import { InteractiveSelectionProvider } from './interaction/InteractiveSelectionProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('🗺️ Codora is ready to explore your code!');

    // Initialize core components
    const symbolExtractor = new SymbolExtractor();
    const aiManager = new AIManager(context);
    const contextMemory = new ContextMemoryManager(context);
    const aiPoweredAnalyzer = new AIPoweredAnalyzer(aiManager, contextMemory);
    const crossFileAnalyzer = new CrossFileAnalyzer(aiPoweredAnalyzer, contextMemory);
    const contextPreservation = new ContextPreservationManager();
    const intelligentNavigator = new IntelligentNavigator(crossFileAnalyzer);
    const semanticAnalyzer = new SemanticBlockAnalyzer(aiPoweredAnalyzer);
    const webviewPanel = CodoraWebviewPanel.getInstance(context);
    webviewPanel.setAIPoweredAnalyzer(aiPoweredAnalyzer);  // Provide analyzer for enhanced webview features
    webviewPanel.setAIManager(aiManager);  // Provide AI manager for dual API system
    const interactiveProvider = new InteractiveSelectionProvider(semanticAnalyzer);
    const hoverProvider = new CodoraHoverProvider(webviewPanel, symbolExtractor, aiManager);

    // Register hover provider for all supported languages
    const supportedLanguages = ['typescript', 'javascript', 'python'];
    supportedLanguages.forEach(language => {
        context.subscriptions.push(
            vscode.languages.registerHoverProvider(language, hoverProvider)
        );
    });

    // Register command to start exploration manually
    const startExplorationCommand = vscode.commands.registerCommand('codora.startExploration', async () => {
        try {
            console.log('🗺️ Manual exploration command triggered');
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;
                console.log(`🗺️ Starting exploration at line ${position.line} in ${editor.document.fileName}`);
                await webviewPanel.startLineByLineExploration(editor.document, position.line);
                vscode.window.showInformationMessage('🗺️ Codora: Line-by-line exploration started!');
            } else {
                vscode.window.showWarningMessage('🗺️ Codora: Please open a code file first to start exploring!');
            }
        } catch (error) {
            console.error('Error in startExploration command:', error);
            vscode.window.showErrorMessage(`🗺️ Codora: Failed to start exploration: ${error}`);
        }
    });

    // Register command to start exploration from hover
    const startExplorationFromHoverCommand = vscode.commands.registerCommand('codora.startExplorationFromHover', async (...args) => {
        try {
            console.log('🗺️ Hover exploration command triggered with args:', args);

            // Handle command arguments - could be single argument (array) or multiple arguments
            let uri: string, line: number, character: number, symbolName: string;

            if (args.length === 1 && Array.isArray(args[0])) {
                // Arguments passed as array
                [uri, line, character, symbolName] = args[0];
            } else if (args.length === 4) {
                // Arguments passed individually
                [uri, line, character, symbolName] = args;
            } else {
                // Try to parse first argument as JSON (fallback)
                const parsedArgs = JSON.parse(args[0]);
                if (Array.isArray(parsedArgs)) {
                    [uri, line, character, symbolName] = parsedArgs;
                } else {
                    throw new Error(`Unexpected argument format: ${args}`);
                }
            }

            console.log(`🗺️ Parsed args - URI: ${uri}, Line: ${line}, Character: ${character}, Symbol: ${symbolName}`);

            try {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
                console.log(`🗺️ Document opened: ${document.fileName}`);

                // Get or create webview panel - this handles the case where panel was closed
                const currentPanel = CodoraWebviewPanel.getInstance(context);
                await currentPanel.startLineByLineExploration(document, line);
                vscode.window.showInformationMessage(`🗺️ Codora: Starting exploration of ${symbolName}`);
            } catch (documentError) {
                console.error('Error opening document:', documentError);
                vscode.window.showErrorMessage(`🗺️ Codora: Failed to open document: ${documentError}`);
            }
        } catch (error) {
            console.error('Error starting exploration from hover:', error);
            vscode.window.showErrorMessage(`🗺️ Codora: Failed to start exploration from hover: ${error}`);
        }
    });

    // Register command to show quick info
    const showQuickInfoCommand = vscode.commands.registerCommand('codora.showQuickInfo', (...args) => {
        try {
            console.log('🗺️ Quick info command triggered with args:', args);

            // Handle command arguments same way as startExplorationFromHover
            let uri: string, line: number, character: number, symbolName: string;

            if (args.length === 1 && Array.isArray(args[0])) {
                [uri, line, character, symbolName] = args[0];
            } else if (args.length === 4) {
                [uri, line, character, symbolName] = args;
            } else {
                const parsedArgs = JSON.parse(args[0]);
                if (Array.isArray(parsedArgs)) {
                    [uri, line, character, symbolName] = parsedArgs;
                } else {
                    throw new Error(`Unexpected argument format: ${args}`);
                }
            }

            vscode.window.showInformationMessage(`Quick Info: ${symbolName} (Full implementation in Phase 2)`);
        } catch (error) {
            console.error('Error showing quick info:', error);
            vscode.window.showErrorMessage(`🗺️ Codora: Failed to show quick info: ${error}`);
        }
    });

    // Register a debug command for testing webview
    const testWebviewCommand = vscode.commands.registerCommand('codora.testWebview', () => {
        try {
            console.log('🗺️ Testing webview visibility...');
            const testPanel = CodoraWebviewPanel.getInstance(context);
            console.log('🗺️ Webview instance obtained:', testPanel ? 'Success' : 'Failed');

            if (testPanel) {
                console.log('🗺️ Webview is visible:', testPanel.isVisible());
                testPanel.focusWebview();
                vscode.window.showInformationMessage('🗺️ Codora: Webview test completed - check console for details');
            }
        } catch (error) {
            console.error('Error in webview test:', error);
            vscode.window.showErrorMessage(`🗺️ Codora: Webview test failed: ${error}`);
        }
    });

    // Register AI management commands
    const showUsageStatsCommand = vscode.commands.registerCommand('codora.showUsageStats', () => {
        try {
            const stats = aiManager.getUsageStats();
            const cacheStats = aiManager.getCacheStats();
            const providerStatus = aiManager.getProviderStatus();

            const message = `🗺️ Codora Usage Statistics:

💰 Cost Overview:
• Total Cost: $${stats.totalCost.toFixed(4)}
• Budget Used: $${stats.budgetUsed.toFixed(2)}/${stats.budgetRemaining + stats.budgetUsed}
• Budget Remaining: $${stats.budgetRemaining.toFixed(2)}

📊 Usage:
• Total Requests: ${stats.totalRequests}
• Total Tokens: ${stats.totalTokens.toLocaleString()}
• Avg Cost/Request: $${stats.averageCostPerRequest.toFixed(4)}

🗄️ Cache:
• Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%
• Total Entries: ${cacheStats.totalEntries}
• Size: ${(cacheStats.sizeBytes / 1024).toFixed(1)} KB

🔌 Providers:
${Object.entries(providerStatus).map(([name, status]) =>
    `• ${name}: ${status ? '✅ Ready' : '❌ Not configured'}`
).join('\\n')}`;

            vscode.window.showInformationMessage(message, 'Open Settings', 'Reset Budget').then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'codora.aiService');
                } else if (selection === 'Reset Budget') {
                    aiManager.resetBudget();
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🗺️ Failed to show usage stats: ${error}`);
        }
    });

    const clearCacheCommand = vscode.commands.registerCommand('codora.clearCache', () => {
        try {
            aiManager.clearCache();
            vscode.window.showInformationMessage('🗺️ Codora: Cache cleared successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`🗺️ Failed to clear cache: ${error}`);
        }
    });

    const refreshConfigCommand = vscode.commands.registerCommand('codora.refreshConfig', () => {
        try {
            aiManager.refreshConfiguration();
            vscode.window.showInformationMessage('🗺️ Codora: Configuration refreshed successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`🗺️ Failed to refresh configuration: ${error}`);
        }
    });

    // Memory management commands
    const showMemoryStatsCommand = vscode.commands.registerCommand('codora.showMemoryStats', () => {
        try {
            const stats = aiPoweredAnalyzer.getCacheStats();
            const message = `🧠 Codora Memory Statistics:

📊 Short-term Cache:
• Entries: ${stats.shortTerm.size}
• Active Keys: ${stats.shortTerm.keys.length}

🗄️ Persistent Memory:
• Total Blocks: ${stats.persistent.totalBlocks}
• Total Interactions: ${stats.persistent.totalInteractions}
• Average Confidence: ${(stats.persistent.averageConfidence * 100).toFixed(1)}%
• Cache Hit Rate: ${(stats.persistent.cacheHitRate * 100).toFixed(1)}%
• Memory Usage: ${(stats.persistent.memoryUsage / 1024).toFixed(1)} KB`;

            vscode.window.showInformationMessage(message, 'Cleanup Cache', 'Most Accessed').then(selection => {
                if (selection === 'Cleanup Cache') {
                    contextMemory.cleanupCache();
                } else if (selection === 'Most Accessed') {
                    const topBlocks = aiPoweredAnalyzer.getMostAccessedBlocks(5);
                    const blockList = topBlocks.map(block => `• ${block.blockName} (${block.userInteractions}x)`).join('\n');
                    vscode.window.showInformationMessage(`🔥 Most Accessed Blocks:\n${blockList}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🧠 Failed to show memory stats: ${error}`);
        }
    });

    const cleanupMemoryCommand = vscode.commands.registerCommand('codora.cleanupMemory', async () => {
        try {
            await contextMemory.cleanupCache();
            vscode.window.showInformationMessage('🧠 Codora: Memory cleanup completed successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`🧠 Failed to cleanup memory: ${error}`);
        }
    });

    const showExplorationHistoryCommand = vscode.commands.registerCommand('codora.showExplorationHistory', () => {
        try {
            const history = aiPoweredAnalyzer.getExplorationHistory();
            const message = `🗺️ Current Exploration Session:

📅 Started: ${history.startTime.toLocaleString()}
🎯 Blocks Explored: ${history.exploredBlocks.length}
📝 Feedback Given: ${history.userFeedback.length}
🔄 Navigation Steps: ${history.navigationPath.length}`;

            vscode.window.showInformationMessage(message, 'View Details').then(selection => {
                if (selection === 'View Details') {
                    // Could open webview with detailed history here
                    vscode.window.showInformationMessage('📊 Detailed history view coming in future update!');
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🗺️ Failed to show exploration history: ${error}`);
        }
    });

    // Cross-file navigation commands
    const showRelatedFilesCommand = vscode.commands.registerCommand('codora.showRelatedFiles', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('🌐 Please open a code file first');
                return;
            }

            const position = editor.selection.active;
            const block = await semanticAnalyzer.findBlockAt(editor.document, position);

            if (block) {
                const context = await crossFileAnalyzer.analyzeRelationships(block, editor.document.uri.toString());

                const message = `🌐 Related Files for ${block.name}:

${context.relatedFiles.length} files found:
${context.relatedFiles.slice(0, 5).map(file =>
    `• ${file.fileName} (${file.relationship}) - ${file.businessConnection}`
).join('\n')}

🔄 Data Flows: ${context.dataFlows.length}
📊 Business Flow: ${context.businessFlow.flowName}`;

                vscode.window.showInformationMessage(message, 'Show Details', 'Navigate').then(selection => {
                    if (selection === 'Show Details') {
                        webviewPanel.showCrossFileAnalysis(context);
                    } else if (selection === 'Navigate' && context.relatedFiles.length > 0) {
                        const firstRelated = context.relatedFiles[0];
                        intelligentNavigator.navigateWithContext(
                            block,
                            editor.document.uri.toString(),
                            firstRelated.fileUri,
                            firstRelated.relevantBlocks[0]?.blockName
                        );
                    }
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`🌐 Failed to analyze related files: ${error}`);
        }
    });

    const showNavigationHistoryCommand = vscode.commands.registerCommand('codora.showNavigationHistory', () => {
        try {
            const session = intelligentNavigator.getCurrentSession();
            const breadcrumbs = intelligentNavigator.getBreadcrumbTrail();

            const message = `🧭 Navigation Session:

📅 Started: ${session.startTime.toLocaleString()}
🔄 Navigations: ${session.navigations.length}
📍 Current Trail: ${breadcrumbs.length} steps

Recent Path:
${breadcrumbs.slice(-5).map(crumb =>
    `${crumb.isCurrent ? '→ ' : '  '}${crumb.file.split('/').pop()}:${crumb.block}`
).join('\n')}`;

            vscode.window.showInformationMessage(message, 'Go Back', 'New Session').then(selection => {
                if (selection === 'Go Back') {
                    intelligentNavigator.navigateBack();
                } else if (selection === 'New Session') {
                    intelligentNavigator.startNewSession();
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🧭 Failed to show navigation history: ${error}`);
        }
    });

    const getNavigationSuggestionsCommand = vscode.commands.registerCommand('codora.getNavigationSuggestions', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('🌐 Please open a code file first');
                return;
            }

            const position = editor.selection.active;
            const block = await semanticAnalyzer.findBlockAt(editor.document, position);

            if (block) {
                const suggestions = await intelligentNavigator.getNavigationSuggestions(
                    block,
                    editor.document.uri.toString()
                );

                if (suggestions.length === 0) {
                    vscode.window.showInformationMessage('🧭 No navigation suggestions found for this code block');
                    return;
                }

                const items = suggestions.map(suggestion => ({
                    label: `${suggestion.targetFile.split('/').pop()}:${suggestion.targetBlock}`,
                    detail: suggestion.reason,
                    description: `${(suggestion.confidence * 100).toFixed(0)}% confidence - ${suggestion.quickAction}`,
                    suggestion
                }));

                vscode.window.showQuickPick(items, {
                    placeHolder: 'Choose related code to navigate to',
                    matchOnDetail: true
                }).then(selected => {
                    if (selected) {
                        intelligentNavigator.navigateWithContext(
                            block,
                            editor.document.uri.toString(),
                            selected.suggestion.targetFile,
                            selected.suggestion.targetBlock,
                            selected.suggestion.reason
                        );
                    }
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`🧭 Failed to get navigation suggestions: ${error}`);
        }
    });

    const showCrossFileStatsCommand = vscode.commands.registerCommand('codora.showCrossFileStats', () => {
        try {
            const crossFileStats = crossFileAnalyzer.getCacheStats();
            const navStats = intelligentNavigator.getNavigationStats();

            const message = `📊 Cross-File Intelligence Statistics:

🌐 Relationship Analysis:
• Cached Contexts: ${crossFileStats.entries}
• Total Relationships: ${crossFileStats.totalRelationships}
• Avg Related Files: ${crossFileStats.averageRelatedFiles.toFixed(1)}

🧭 Navigation Patterns:
• Total Sessions: ${navStats.totalSessions}
• Total Navigations: ${navStats.totalNavigations}
• Avg per Session: ${navStats.averageNavigationsPerSession.toFixed(1)}

🔥 Top Navigation Reasons:
${navStats.mostCommonNavigationReasons.slice(0, 3).map(reason =>
    `• ${reason.reason} (${reason.count}x)`
).join('\n')}`;

            vscode.window.showInformationMessage(message, 'Clear Cache', 'New Session').then(selection => {
                if (selection === 'Clear Cache') {
                    crossFileAnalyzer.clearCache();
                    vscode.window.showInformationMessage('🌐 Cross-file cache cleared');
                } else if (selection === 'New Session') {
                    intelligentNavigator.startNewSession();
                    vscode.window.showInformationMessage('🧭 New navigation session started');
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`📊 Failed to show cross-file stats: ${error}`);
        }
    });

    // Context Preservation Commands
    const startContextSessionCommand = vscode.commands.registerCommand('codora.startContextSession', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('🧠 Please open a file to start context session');
                return;
            }

            const task = await vscode.window.showInputBox({
                prompt: 'What are you trying to understand or accomplish?',
                placeHolder: 'e.g., Understanding the authentication flow, Debugging payment issues...'
            });

            if (!task) {
                return;
            }

            const position = editor.selection.active;
            const document = editor.document;
            const wordRange = document.getWordRangeAtPosition(position);
            const block = wordRange ? document.getText(wordRange) : 'unknown';

            const sessionId = contextPreservation.startNewSession(task, document.uri.toString(), block);
            vscode.window.showInformationMessage(`🧠 Context session started: ${sessionId.split('_')[2]}`);
        } catch (error) {
            vscode.window.showErrorMessage(`🧠 Failed to start context session: ${error}`);
        }
    });

    const showContextSummaryCommand = vscode.commands.registerCommand('codora.showContextSummary', () => {
        try {
            const summary = contextPreservation.getContextSummary();
            const message = `🧠 Context Summary:

📋 Task: ${summary.task || 'No active session'}
🎯 Current Focus: ${summary.currentFocus}

📈 Progress:
• Files explored: ${summary.progress.filesExplored}
• Blocks analyzed: ${summary.progress.blocksAnalyzed}
• Connections found: ${summary.progress.connectionsFound}
• Insights captured: ${summary.progress.insightsCaptured}

📚 Recent Path:
${summary.recentPath.map((path, i) => `${i + 1}. ${path}`).join('\n')}

🔖 Bookmarks: ${summary.bookmarks}
📝 Annotations: ${summary.annotations}`;

            vscode.window.showInformationMessage(message, 'Add Bookmark', 'Add Note').then(selection => {
                if (selection === 'Add Bookmark') {
                    vscode.commands.executeCommand('codora.addContextBookmark');
                } else if (selection === 'Add Note') {
                    vscode.commands.executeCommand('codora.addContextAnnotation');
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🧠 Failed to show context summary: ${error}`);
        }
    });

    const addContextBookmarkCommand = vscode.commands.registerCommand('codora.addContextBookmark', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('🔖 Please open a file to add bookmark');
                return;
            }

            const reason = await vscode.window.showInputBox({
                prompt: 'Why is this location important?',
                placeHolder: 'e.g., Key decision point, Complex logic, Important interface...'
            });

            if (!reason) {
                return;
            }

            const importance = await vscode.window.showQuickPick(
                ['high', 'medium', 'low'],
                { placeHolder: 'Select importance level' }
            ) as 'high' | 'medium' | 'low';

            if (!importance) {
                return;
            }

            const position = editor.selection.active;
            const document = editor.document;
            const wordRange = document.getWordRangeAtPosition(position);
            const block = wordRange ? document.getText(wordRange) : `line-${position.line}`;

            contextPreservation.createBookmark(document.uri.toString(), block, reason, importance);
            vscode.window.showInformationMessage(`🔖 ${importance.toUpperCase()} bookmark added`);
        } catch (error) {
            vscode.window.showErrorMessage(`🔖 Failed to add bookmark: ${error}`);
        }
    });

    const addContextAnnotationCommand = vscode.commands.registerCommand('codora.addContextAnnotation', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('📝 Please open a file to add annotation');
                return;
            }

            const type = await vscode.window.showQuickPick(
                [
                    { label: '💡 Insight', value: 'insight' },
                    { label: '❓ Question', value: 'question' },
                    { label: '📋 Todo', value: 'todo' },
                    { label: '🔗 Connection', value: 'connection' }
                ],
                { placeHolder: 'Select annotation type' }
            );

            if (!type) {
                return;
            }

            const note = await vscode.window.showInputBox({
                prompt: `Add your ${type.label.split(' ')[1].toLowerCase()}:`,
                placeHolder: 'Enter your note...'
            });

            if (!note) {
                return;
            }

            const position = editor.selection.active;
            contextPreservation.addAnnotation(
                { file: editor.document.uri.toString(), line: position.line },
                note,
                type.value as any
            );

            vscode.window.showInformationMessage(`📝 ${type.label} added`);
        } catch (error) {
            vscode.window.showErrorMessage(`📝 Failed to add annotation: ${error}`);
        }
    });

    const getContextSuggestionsCommand = vscode.commands.registerCommand('codora.getContextSuggestions', () => {
        try {
            const suggestions = contextPreservation.getContextualSuggestions();

            if (suggestions.length === 0) {
                vscode.window.showInformationMessage('🧠 No context suggestions available. Start a context session first.');
                return;
            }

            const items = suggestions.map(s => ({
                label: `${s.type === 'bookmark' ? '🔖' : s.type === 'recent' ? '🕒' : s.type === 'related' ? '🔗' : '🔍'} ${s.target.block}`,
                description: `${s.target.file.split('/').pop()} - Priority: ${(s.priority * 100).toFixed(0)}%`,
                detail: s.reason,
                target: s.target
            }));

            vscode.window.showQuickPick(items, {
                placeHolder: 'Select where to navigate based on your context'
            }).then(async (selected) => {
                if (selected) {
                    try {
                        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(selected.target.file));
                        await vscode.window.showTextDocument(document);
                        vscode.window.showInformationMessage(`🧭 Navigated to: ${selected.target.block}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`🧭 Failed to navigate: ${error}`);
                    }
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`🧠 Failed to get context suggestions: ${error}`);
        }
    });

    context.subscriptions.push(
        startExplorationCommand,
        startExplorationFromHoverCommand,
        showQuickInfoCommand,
        testWebviewCommand,
        showUsageStatsCommand,
        clearCacheCommand,
        refreshConfigCommand,
        showMemoryStatsCommand,
        cleanupMemoryCommand,
        showExplorationHistoryCommand,
        showRelatedFilesCommand,
        showNavigationHistoryCommand,
        getNavigationSuggestionsCommand,
        showCrossFileStatsCommand,
        startContextSessionCommand,
        showContextSummaryCommand,
        addContextBookmarkCommand,
        addContextAnnotationCommand,
        getContextSuggestionsCommand,
        interactiveProvider,
        contextMemory
    );

    // Log successful activation
    console.log('🗺️ Codora extension activated successfully');
    console.log(`🗺️ Registered commands: startExploration, startExplorationFromHover, showQuickInfo, testWebview`);
    console.log(`🗺️ Registered hover providers for: ${supportedLanguages.join(', ')}`);

    vscode.window.showInformationMessage('🗺️ Codora is ready to help you explore and understand code!');
}

export function deactivate() {
    console.log('🗺️ Codora exploration ended. Happy coding!');
}