import * as vscode from 'vscode';
import { CodoraHoverProvider } from './hoverProvider';
import { CodoraWebviewPanel } from './webviewPanel';
import { SymbolExtractor } from './symbolExtractor';
import { AIManager } from './ai/AIManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('🗺️ Codora is ready to explore your code!');

    // Initialize core components
    const symbolExtractor = new SymbolExtractor();
    const aiManager = new AIManager(context);
    const webviewPanel = CodoraWebviewPanel.getInstance(context);
    const hoverProvider = new CodoraHoverProvider(webviewPanel, symbolExtractor, aiManager);

    // Register hover provider for all supported languages
    const supportedLanguages = ['typescript', 'javascript', 'python'];
    supportedLanguages.forEach(language => {
        context.subscriptions.push(
            vscode.languages.registerHoverProvider(language, hoverProvider)
        );
    });

    // Register command to start exploration manually
    const startExplorationCommand = vscode.commands.registerCommand('codora.startExploration', () => {
        try {
            console.log('🗺️ Manual exploration command triggered');
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;
                console.log(`🗺️ Starting exploration at line ${position.line} in ${editor.document.fileName}`);
                webviewPanel.startLineByLineExploration(editor.document, position.line);
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
                currentPanel.startLineByLineExploration(document, line);
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

    context.subscriptions.push(
        startExplorationCommand,
        startExplorationFromHoverCommand,
        showQuickInfoCommand,
        testWebviewCommand,
        showUsageStatsCommand,
        clearCacheCommand,
        refreshConfigCommand
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