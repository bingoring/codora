# 🗺️ Codora - AI-Powered Code Explorer

**Interactive AI guide for understanding complex codebases like Dora explores new territories**

## ✨ Features

### 🧠 AI-First Analysis
- **Fully AI-powered** code understanding (no more AST parsing)
- **Intelligent explanations** with business context awareness
- **Context-aware analysis** using surrounding code for better insights

### 💡 Dual API Key System
- **Smart model selection** based on code complexity
- **Cost optimization** - use expensive models only for complex code
- **Automatic routing** between efficiency and performance models

### 🎯 Interactive Exploration
- **Line-by-line exploration** with AI-generated explanations
- **Hover insights** with quick code understanding
- **Cross-file navigation** with relationship mapping
- **Context preservation** across exploration sessions

### 📊 Cost Management
- **Budget tracking** with configurable limits
- **Usage analytics** and cost optimization
- **Smart caching** to reduce API calls
- **Model preference** settings for cost control

## 🚀 Quick Start

### 1. Installation
1. Install the Codora extension in VS Code
2. Configure your AI provider settings

### 2. Configuration

#### Basic Setup (Single API Key)
```json
{
  "codora.aiService.provider": "dual",
  "codora.aiService.apiKey": "your-openai-api-key"
}
```

#### Optimized Setup (Dual API Keys)
```json
{
  "codora.aiService.provider": "dual",
  "codora.aiService.efficiencyApiKey": "your-gpt-3.5-api-key",
  "codora.aiService.performanceApiKey": "your-gpt-4-api-key",
  "codora.aiService.complexityThreshold": 0.6
}
```

### 3. Usage
- **Manual exploration**: `Cmd+Shift+P` → "🗺️ Start Code Exploration"
- **Hover exploration**: Hover over code → Click exploration button
- **Context menu**: Right-click in editor → "🗺️ Start Code Exploration"

## ⚙️ Configuration Options

### AI Service Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `provider` | string | `"dual"` | AI provider: `openai`, `anthropic`, `local`, `dual` |
| `apiKey` | string | - | Primary API key (fallback for dual mode) |
| `efficiencyApiKey` | string | - | API key for simple code analysis |
| `performanceApiKey` | string | - | API key for complex code analysis |
| `efficiencyModel` | string | `"gpt-3.5-turbo"` | Cost-effective model |
| `performanceModel` | string | `"gpt-4"` | High-performance model |
| `complexityThreshold` | number | `0.6` | Complexity switching point (0.0-1.0) |

### Cost Management
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `budgetLimit` | number | `10` | Monthly budget limit (USD) |
| `preferCheaperModels` | boolean | `true` | Prefer cost-effective models |
| `enableBatching` | boolean | `false` | Enable request batching |

### Features
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `autoExplain` | boolean | `true` | Auto-explain on hover |
| `contextAware` | boolean | `true` | Use surrounding context |
| `cacheExplanations` | boolean | `false` | Cache responses locally |
| `showHoverButtons` | boolean | `true` | Show exploration buttons on hover |

## 🏗️ Architecture

### AI-First Approach
Codora uses a fully AI-powered architecture:

1. **No AST Parsing** - Visual inspection is faster than programmatic analysis
2. **Context-Aware AI** - Uses surrounding code for better understanding
3. **Intelligent Routing** - Automatically selects the best model for each task
4. **Cost Optimization** - Smart model selection reduces API costs

### Complexity Analysis
The system analyzes code complexity using:
- Code length and structure
- Nesting depth and patterns
- Language-specific complexity
- Context and domain keywords
- Function/method density

**Complexity Score**: `0.0` (simple) → `1.0` (very complex)

### Smart Model Selection
- **Simple code** (< threshold) → Efficiency model (GPT-3.5-turbo)
- **Complex code** (≥ threshold) → Performance model (GPT-4)
- **Cost optimization** with automatic fallbacks

## 📚 Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Start Code Exploration | `Cmd+Shift+E` | Begin line-by-line exploration |
| Show Quick Info | - | Display code information panel |
| Open Configuration | - | Open Codora settings |
| Show Usage Statistics | - | Display AI usage and costs |
| Clear Cache | - | Clear explanation cache |
| Refresh Configuration | - | Reload settings |

## 💰 Cost Optimization Tips

1. **Use Dual API Keys**
   - Set `efficiencyApiKey` for routine analysis
   - Set `performanceApiKey` for complex code only

2. **Enable Caching**
   ```json
   { "codora.features.cacheExplanations": true }
   ```

3. **Set Budget Limits**
   ```json
   { "codora.aiService.budgetLimit": 25 }
   ```

4. **Adjust Complexity Threshold**
   ```json
   { "codora.aiService.complexityThreshold": 0.7 }
   ```
   Higher threshold = more efficient model usage

## 🛠️ Development

### Prerequisites
- Node.js 16+
- VS Code Extension Development Host

### Building
```bash
npm install
npm run compile
npm run lint
```

### Testing
```bash
npm test
```

## 📄 Documentation

- [AI Architecture Overview](./AI_ARCHITECTURE.md) - Detailed technical architecture
- [Configuration Guide](./AI_ARCHITECTURE.md#configuration-examples) - Setup examples
- [Migration Guide](./AI_ARCHITECTURE.md#migration-guide) - Upgrading from older versions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📜 License

MIT License - see LICENSE file for details

## 🌟 Why Codora?

**"Just like Dora the Explorer makes unknown territories accessible and fun to explore, Codora makes complex codebases approachable and understandable through AI-powered guidance."**

- **Intelligent**: AI understands context better than static analysis
- **Cost-Effective**: Smart model selection optimizes API usage
- **Interactive**: Explore code naturally with contextual insights
- **Scalable**: Works with any codebase size or complexity

---

**Happy Code Exploring!** 🗺️✨