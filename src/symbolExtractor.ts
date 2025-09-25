import * as vscode from 'vscode';

export interface CodeSymbol {
    name: string;
    kind: vscode.SymbolKind;
    range: vscode.Range;
    detail?: string;
    documentation?: string;
    containerName?: string;
}

export class SymbolExtractor {

    async getSymbolAt(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<CodeSymbol | null> {

        try {
            // Try to get symbol information using VSCode's built-in language server
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return null;
            }

            // Find the symbol at the given position
            const symbol = this.findSymbolAtPosition(symbols, position);

            if (symbol) {
                return {
                    name: symbol.name,
                    kind: symbol.kind,
                    range: symbol.range,
                    detail: symbol.detail
                };
            }

            // Fallback: try to extract symbol from the word at position
            return this.extractSymbolFromWord(document, position);

        } catch (error) {
            console.error('Error getting symbol:', error);
            return this.extractSymbolFromWord(document, position);
        }
    }

    private findSymbolAtPosition(
        symbols: vscode.DocumentSymbol[],
        position: vscode.Position
    ): vscode.DocumentSymbol | null {

        for (const symbol of symbols) {
            // Check if position is within this symbol's range
            if (symbol.range.contains(position)) {

                // First check if it's in any child symbol
                if (symbol.children && symbol.children.length > 0) {
                    const childSymbol = this.findSymbolAtPosition(symbol.children, position);
                    if (childSymbol) {
                        return childSymbol;
                    }
                }

                // Check if we're specifically on the symbol's selection range (name)
                if (symbol.selectionRange.contains(position)) {
                    return symbol;
                }

                // If we're within the symbol but not on the name, return the symbol
                // This handles cases where we hover over function body, etc.
                return symbol;
            }
        }

        return null;
    }

    private extractSymbolFromWord(
        document: vscode.TextDocument,
        position: vscode.Position
    ): CodeSymbol | null {

        // Get word range at position
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);

        // Skip if it's not a meaningful word
        if (!word || word.length < 2 || this.isKeyword(word)) {
            return null;
        }

        // Try to determine the symbol kind based on context
        const line = document.lineAt(position.line).text;
        const kind = this.guessSymbolKind(line, word);

        return {
            name: word,
            kind: kind,
            range: wordRange
        };
    }

    private isKeyword(word: string): boolean {
        const keywords = [
            'const', 'let', 'var', 'function', 'class', 'interface', 'type',
            'if', 'else', 'for', 'while', 'return', 'import', 'export',
            'async', 'await', 'try', 'catch', 'finally', 'throw',
            'def', 'lambda', 'pass', 'break', 'continue', 'global', 'nonlocal'
        ];
        return keywords.includes(word.toLowerCase());
    }

    private guessSymbolKind(line: string, word: string): vscode.SymbolKind {
        const lowerLine = line.toLowerCase();

        if (lowerLine.includes('function') || lowerLine.includes('def') || lowerLine.includes('=>')) {
            return vscode.SymbolKind.Function;
        }

        if (lowerLine.includes('class')) {
            return vscode.SymbolKind.Class;
        }

        if (lowerLine.includes('interface')) {
            return vscode.SymbolKind.Interface;
        }

        if (lowerLine.includes('const') || lowerLine.includes('let') || lowerLine.includes('var')) {
            return vscode.SymbolKind.Variable;
        }

        // If word starts with capital letter, likely a class or constructor
        if (word[0] === word[0].toUpperCase()) {
            return vscode.SymbolKind.Class;
        }

        return vscode.SymbolKind.Function;
    }

    async getAllSymbols(document: vscode.TextDocument): Promise<CodeSymbol[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols) {
                return [];
            }

            return this.flattenSymbols(symbols);

        } catch (error) {
            console.error('Error getting all symbols:', error);
            return [];
        }
    }

    private flattenSymbols(symbols: vscode.DocumentSymbol[], containerName?: string): CodeSymbol[] {
        const result: CodeSymbol[] = [];

        for (const symbol of symbols) {
            result.push({
                name: symbol.name,
                kind: symbol.kind,
                range: symbol.range,
                detail: symbol.detail,
                containerName: containerName
            });

            // Recursively process children
            if (symbol.children && symbol.children.length > 0) {
                result.push(...this.flattenSymbols(symbol.children, symbol.name));
            }
        }

        return result;
    }
}