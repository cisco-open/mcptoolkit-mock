# VS Code Extension Development Guide

## Testing the Extension

### Method 1: Run in Extension Development Host

1. Open the `extension/` folder in VS Code:
   ```bash
   code extension/
   ```

2. Press `F5` to launch Extension Development Host
   - A new VS Code window opens with the extension loaded
   - The extension is active only in this window

3. Test the command:
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Type "MCP Mock: Build Mock Data with AI"
   - Follow the prompts to select mcpdesc file and output directory

4. Check the Debug Console in the original VS Code window for logs

### Method 2: Install Locally

1. Package the extension:
   ```bash
   cd extension/
   npm install -g @vscode/vsce
   vsce package
   ```

2. Install the VSIX:
   ```bash
   code --install-extension mcpmock-vscode-0.1.0.vsix
   ```

3. Reload VS Code and test as normal user

## Publishing to Marketplace

### Prerequisites

1. Create Azure DevOps account: https://dev.azure.com
2. Create Personal Access Token (PAT):
   - Organization Settings → Personal Access Tokens
   - Scopes: Marketplace (Manage)
3. Create publisher:
   ```bash
   vsce create-publisher <publisher-name>
   ```

### Publish Steps

1. Update `package.json` with publisher name:
   ```json
   {
     "publisher": "your-publisher-name"
   }
   ```

2. Login with PAT:
   ```bash
   vsce login your-publisher-name
   ```

3. Package and publish:
   ```bash
   vsce package
   vsce publish
   ```

4. Extension will be available at:
   ```
   https://marketplace.visualstudio.com/items?itemName=your-publisher-name.mcpmock-vscode
   ```

## Debugging

### Check Extension Logs

1. Open Output panel: `View → Output`
2. Select "Extension Host" from dropdown
3. Look for "MCP Mock extension activated" message

### Debug Breakpoints

1. Set breakpoints in `src/extension.ts` or `src/build-integration.ts`
2. Press `F5` to launch Extension Development Host
3. Trigger command to hit breakpoints

### Test runSubagent Access

Add debug logging in `build-integration.ts`:

```typescript
const runSubagent = (globalThis as any).runSubagent;
console.log('runSubagent available:', typeof runSubagent === 'function');
```

## Common Issues

### Issue: "runSubagent is not a function"

**Cause**: GitHub Copilot extension not installed or not active

**Solution**:
- Install GitHub Copilot extension
- Ensure Copilot is signed in and active
- Restart VS Code

### Issue: Extension not appearing in Command Palette

**Cause**: Extension not activated properly

**Solution**:
- Check `package.json` activation events
- Reload window: `Developer: Reload Window`
- Check Extension Host output for errors

### Issue: Build fails with missing types

**Cause**: Missing @types/vscode dependency

**Solution**:
```bash
npm install --save-dev @types/vscode
```

## Architecture

```
extension/
├── package.json              # Extension manifest
├── src/
│   ├── extension.ts         # Main extension entry point
│   │                        # - Command registration
│   │                        # - UI (file pickers, progress)
│   │                        # - Quick actions
│   └── build-integration.ts # Core build logic
│                            # - Dump file loading
│                            # - Relationship analysis
│                            # - AI generation (runSubagent)
│                            # - Faker fallback
│                            # - File writing
└── out/                     # Compiled JavaScript
```

## Next Steps

1. **Test Thoroughly**: Test with various mcpdesc files
2. **Add Icon**: Create 128x128 icon for marketplace
3. **Add Screenshots**: Capture command palette, file picker, progress
4. **Update README**: Add animated GIF demo
5. **Add Tests**: Unit tests for build-integration.ts
6. **Publish**: Release to VS Code Marketplace

## Related Commands

```bash
# Compile extension
npm run compile

# Watch mode (auto-recompile)
npm run watch

# Package for distribution
vsce package

# Publish to marketplace
vsce publish

# Uninstall extension
code --uninstall-extension publisher.mcpmock-vscode
```

## Testing Checklist

- [ ] Extension activates without errors
- [ ] Command appears in Command Palette
- [ ] File picker opens for mcpdesc file selection
- [ ] Folder picker opens for output directory
- [ ] AI/no-AI prompt appears
- [ ] Progress indicator shows during generation
- [ ] Files are created in output directory
- [ ] Success message shows with quick actions
- [ ] "Open Folder" button works
- [ ] "Run Test" button opens terminal with correct command
- [ ] AI generation works (with Copilot)
- [ ] Faker fallback works (without Copilot)
- [ ] Error handling shows user-friendly messages

---

**Ready to ship! 🚀**
