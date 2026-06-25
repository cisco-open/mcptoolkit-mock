# MCP Mock Builder - VS Code Extension

AI-assisted mock data builder for Model Context Protocol (MCP) servers.

## Features

- **Command Palette Integration**: Access via `MCP Mock: Build Mock Data with AI`
- **AI-Assisted Generation**: Leverages GitHub Copilot for realistic, contextually-appropriate mock data
- **Interactive File Selection**: Use native VS Code file/folder pickers
- **Progress Indicators**: Visual feedback during mock generation
- **Quick Actions**: Open output folder or test immediately after generation

## Requirements

- VS Code 1.85.0 or higher
- GitHub Copilot extension (for AI-assisted generation)
- mcpmock CLI installed (`npm install -g mcpmock`)

## Usage

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "MCP Mock: Build Mock Data with AI"
3. Select your MCP mcpdesc file (from mcpcontract)
4. Choose output directory for mock files
5. Decide whether to use AI assistance
6. Wait for generation to complete
7. Open folder or test mock server immediately

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

- AI generation requires GitHub Copilot extension to be active
- Falls back to faker-based generation if AI unavailable

## Release Notes

### 0.1.0

Initial release:
- Command Palette integration
- AI-assisted mock generation via runSubagent
- Interactive file/folder selection
- Progress indicators
- Quick action buttons

---

**Enjoy building realistic MCP mocks!** 🚀
