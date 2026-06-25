# Tutorial: VS Code Extension (⚠️ Experimental)

Learn how to use the mcpmock VS Code extension for UI-based mock generation.

## ⚠️ Status: Experimental

The VS Code extension is **untested and experimental**. For production use, we recommend:
- **CLI**: `mcpmock build` (documented, tested)
- **Recording**: `mcpmock record` (documented, tested)

Use this extension for:
- Exploring AI generation visually
- Quick prototyping
- Learning the build workflow

## Installation

### Option 1: From Source

```bash
cd extension/
npm install
npm run compile

# Install locally
code --install-extension mcpmock-vscode-0.1.0.vsix
```

### Option 2: Development Mode

```bash
cd extension/
code .
# Press F5 to launch Extension Development Host
```

## Using the Extension

### 1. Open Command Palette

Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)

### 2. Run Command

Type: `MCP Mock: Build Mock Data with AI`

### 3. Select McpDesc File

File picker opens → select your `.mcpdesc.json` file

### 4. Select Output Directory

Folder picker opens → choose where to save generated mocks

### 5. Choose AI Option

Prompt asks: "Use AI to generate realistic mock data?"
- **Yes**: Tries AI generation (requires GitHub Copilot)
- **No**: Uses faker for basic generation

### 6. Wait for Generation

Progress notification shows:
```
MCP Mock Builder
Analyzing mcpdesc file...
Generated 5 mock file(s)
```

### 7. View Results

Click quick action button:
- **Open Folder**: Reveals output directory in explorer
- **Run Test**: Opens terminal with `mcpmock run` command

## How It Works

The extension:
1. Calls same build logic as CLI
2. Has access to `runSubagent` (AI generation)
3. Falls back to faker if AI unavailable
4. Generates same files as `mcpmock build`

**Equivalent CLI command**:
```bash
mcpmock build --mcpdesc <file> --output <dir>
```

## Testing the Extension

### Launch Development Host

1. Open `extension/` folder in VS Code
2. Press `F5` (or Run → Start Debugging)
3. New window opens with extension loaded
4. Test command in new window

### Check Logs

- View → Output
- Select "Extension Host" from dropdown
- Look for: "MCP Mock extension activated"

## Known Issues

### Extension not appearing

**Problem**: Command not in Command Palette

**Solution**:
```bash
# Rebuild extension
cd extension/
npm run compile

# Reload VS Code
Ctrl+Shift+P → "Developer: Reload Window"
```

### AI generation not working

**Problem**: Falls back to faker

**Solution**:
- Install GitHub Copilot extension
- Sign in to Copilot
- Restart VS Code
- Or use CLI: `mcpmock build` (has Copilot CLI support)

### File picker not opening

**Problem**: Extension doesn't show file dialogs

**Solution**:
- Check extension is activated (see logs)
- Try running command again
- Or use CLI workflow

## CLI Alternative (Recommended)

The CLI has the same features, better tested:

```bash
# Same as extension, but from command line
mcpmock build \
  --mcpdesc weather-server.mcpdesc.json \
  --output mocks/ \
  --verbose
```

**Advantages**:
- More stable
- Scriptable
- CI/CD friendly
- Copilot CLI support
- Better error messages

## Comparison

| Feature | VS Code Extension | CLI |
|---------|------------------|-----|
| **Status** | ⚠️ Experimental | ✅ Tested |
| **UI** | File pickers, buttons | Command line |
| **AI** | runSubagent | Copilot CLI + runSubagent |
| **Automation** | Manual | Scriptable |
| **Debugging** | Extension logs | Verbose flag |
| **Recommended** | Exploration | Production |

## Development

Want to improve the extension? See [extension/DEVELOPMENT.md](../../extension/DEVELOPMENT.md)

**Extension code**:
- `extension/src/extension.ts` - Command registration, UI
- `extension/src/build-integration.ts` - Build logic
- `extension/package.json` - Extension manifest

## Next Steps

- 📖 Read [Building Mocks](building-mocks.md) for CLI workflow (recommended)
- 📖 Read [HTTP Transport](http-transport.md) for web integration
- 🔧 Read [extension/DEVELOPMENT.md](../../extension/DEVELOPMENT.md) to contribute

## Summary

**For learning**: Try the extension!
**For production**: Use `mcpmock build` CLI

```bash
# CLI equivalent (better tested)
mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --verbose
```

**Key takeaways**:
- Extension is experimental and untested
- CLI workflow is recommended for production
- Both generate the same mock files
- Extension provides UI, CLI provides stability
