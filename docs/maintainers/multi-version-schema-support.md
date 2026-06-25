# Multi-Version McpDesc Schema Support

**Status**: Draft  
**Created**: 2026-01-03  
**Author**: Design Discussion

## Problem Statement

Currently, mcpmock only supports a single mcpdesc schema version at a time (`0.4.0`), with the schema file stored at `schemas/mcpdesc-schema.json`. As the mcpdesc format evolves with new features (e.g., session ID in 0.4.0, CORS in 0.4.1), we need a strategy to:

1. Support multiple mcpdesc schema versions simultaneously
2. Handle version-specific features gracefully
3. Maintain backward compatibility with older dumps
4. Minimize maintenance burden
5. Provide clear guidance on version support lifecycle

## Current Situation

### Schema Versioning (as of 0.4.0)

**Version 0.3.1** (contract-2.6.3.yaml):
```yaml
version: https://developer.cisco.com/mcp-description/schema/0.3.1
info:
  info:
    sessionIdSupported: true  # Boolean flag only
```

**Version 0.4.0** (contract-2.7.0.yaml):
```yaml
version: https://developer.cisco.com/mcp-description/schema/0.4.0
info:
  info:
    sessionIdSupported: true
    sessionIdHeader: mcp-session-id  # New: header name
```

**Planned 0.4.1**:
- CORS support fields (exact structure TBD)

### Current Implementation

**Schema Storage**:
```
schemas/
  mcpdesc-schema.json  # Only latest version (0.4.0)
```

**Version Detection**:
```typescript
// src/lib/mcpdesc-loader.ts
const SUPPORTED_VERSIONS = [
  'https://developer.cisco.com/mcp-description/schema/0.3.1',
  'https://developer.cisco.com/mcp-description/schema/0.4.0'
];
```

**Validation**:
- Single Ajv validator compiled from `mcpdesc-schema.json`
- No version-specific validation logic

**Runtime Behavior**:
- No version-aware feature handling
- All dumps treated uniformly after validation

## Key Questions

### 1. Version Support Scope

**How many versions should we support?**

Options:
- **Option A**: Rolling window (e.g., last 3 major versions)
- **Option B**: N-1 support (current + previous)
- **Option C**: Indefinite support (all versions forever)
- **Option D**: Explicit deprecation policy (support for X months/years)

**Recommendation**: Option D with N-1 as minimum
- Support current version + at least one previous version
- Deprecate older versions with 6-month notice
- Document support lifecycle in README

### 2. Schema Storage Strategy

**How to store multiple schema files?**

**Option A: Versioned Files**
```
schemas/
  mcpdesc-schema-0.3.1.json
  mcpdesc-schema-0.4.0.json
  mcpdesc-schema-0.4.1.json
```

Pros:
- Explicit version isolation
- Easy to add/remove versions
- Clear file organization

Cons:
- File duplication (schemas are large)
- Maintenance burden for shared definitions

**Option B: Directory Structure**
```
schemas/
  0.3.1/
    schema.json
  0.4.0/
    schema.json
  0.4.1/
    schema.json
```

Pros:
- Allows version-specific assets (examples, docs)
- Clear versioning
- Room for future extensions

Cons:
- More complex file structure
- Deeper nesting

**Option C: Single Schema with Version Branches**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "anyOf": [
    { "$ref": "#/definitions/schema_0_3_1" },
    { "$ref": "#/definitions/schema_0_4_0" },
    { "$ref": "#/definitions/schema_0_4_1" }
  ],
  "definitions": {
    "schema_0_3_1": { /* ... */ },
    "schema_0_4_0": { /* ... */ },
    "schema_0_4_1": { /* ... */ }
  }
}
```

Pros:
- Single file to manage
- Shared definitions via $ref
- Version logic in schema itself

Cons:
- Complex schema structure
- Harder to maintain
- Large file size
- Difficult validation errors

**Recommendation**: **Option A** (Versioned Files)
- Simple and explicit
- Easy to copy from mcpcontract releases
- Clear maintenance story
- Schema duplication is acceptable (they diverge over time)

### 3. Validation Strategy

**How to validate against the correct schema?**

**Option A: Version-Specific Validators**
```typescript
class McpDescLoader {
  private validators: Map<string, ValidateFunction>;
  
  async load(filePath: string): Promise<McpDescFile> {
    const dump = await loadYamlOrJson(filePath);
    const version = dump.version;
    const validator = this.validators.get(version);
    // Validate with version-specific validator
  }
}
```

Pros:
- Clean separation
- Version-specific error messages
- Flexible validation logic per version

Cons:
- More memory usage (multiple compiled validators)
- Initial load time for all validators

**Option B: Dynamic Schema Loading**
```typescript
async load(filePath: string): Promise<McpDescFile> {
  const dump = await loadYamlOrJson(filePath);
  const schema = await this.loadSchemaForVersion(dump.version);
  const validator = this.ajv.compile(schema);
  // Validate
}
```

Pros:
- Lower memory footprint
- Lazy loading
- Simple implementation

Cons:
- Repeated compilation overhead
- Slower for multiple files

**Recommendation**: **Option A** with lazy initialization
- Pre-compile validators on first use per version
- Cache compiled validators
- Best performance for typical usage (multiple files, same versions)

### 4. Runtime Feature Handling

**How to handle version-specific features at runtime?**

**Examples of Version-Specific Features**:

| Feature | Version | Impact on Mock Server |
|---------|---------|----------------------|
| `sessionIdHeader` | 0.4.0+ | HTTP transport needs header handling |
| CORS config | 0.4.1+ | HTTP transport needs CORS middleware |
| Future features | 0.5.0+ | TBD |

**Option A: Feature Detection**
```typescript
class MockServer {
  start(dump: McpDescFile) {
    const features = this.detectFeatures(dump);
    
    if (features.sessionIdHeader) {
      this.enableSessionIdHandling(features.sessionIdHeader);
    }
    
    if (features.corsConfig) {
      this.enableCors(features.corsConfig);
    }
  }
}
```

Pros:
- Feature-based, not version-based
- Flexible for mixed feature support
- Forward-compatible

Cons:
- Requires feature detection logic
- More complex than version checks

**Option B: Version-Based Behavior**
```typescript
class MockServer {
  start(dump: McpDescFile) {
    const version = this.parseVersion(dump.version);
    
    if (version.gte('0.4.0')) {
      this.enableSessionIdHandling();
    }
    
    if (version.gte('0.4.1')) {
      this.enableCors();
    }
  }
}
```

Pros:
- Simple version comparison
- Clear version requirements
- Easy to reason about

Cons:
- Tightly coupled to versions
- Harder to handle feature backports
- Less flexible

**Option C: Hybrid Approach**
```typescript
class MockServer {
  start(dump: McpDescFile) {
    // Schema validation guarantees feature presence
    const features = this.extractFeatures(dump);
    
    // Type-safe feature handling based on validated schema
    if (features.sessionIdHeader !== undefined) {
      this.enableSessionIdHandling(features.sessionIdHeader);
    }
    
    if (features.corsConfig !== undefined) {
      this.enableCors(features.corsConfig);
    }
  }
}
```

Pros:
- Type-safe feature extraction
- Schema validation ensures correctness
- No version checks in runtime code
- Naturally forward-compatible

Cons:
- Requires careful type modeling
- TypeScript union types for McpDescFile

**Recommendation**: **Option C** (Hybrid Approach)
- Schema validation guarantees feature presence
- Runtime code checks for feature existence, not versions
- TypeScript types provide compile-time safety
- Most maintainable long-term

### 5. Type Definitions

**How to model version-specific types?**

**Option A: Union Types**
```typescript
type McpDescFile = McpDescFile_0_3_1 | McpDescFile_0_4_0 | McpDescFile_0_4_1;

interface McpDescFile_0_3_1 {
  version: 'https://developer.cisco.com/mcp-description/schema/0.3.1';
  info: {
    info: {
      sessionIdSupported: boolean;
      // No sessionIdHeader
    };
  };
  // ...
}

interface McpDescFile_0_4_0 {
  version: 'https://developer.cisco.com/mcp-description/schema/0.4.0';
  info: {
    info: {
      sessionIdSupported: boolean;
      sessionIdHeader?: string;  // New field
    };
  };
  // ...
}
```

Pros:
- Type-safe discriminated unions
- Compile-time version checking
- Precise type inference

Cons:
- Type explosion
- Complex type narrowing
- Maintenance burden

**Option B: Common Base + Extensions**
```typescript
interface McpDescFileBase {
  version: string;
  info: DumpDetailsBase;
  serverInfo: ServerInfo;
  tools: Tool[];
  // Common fields
}

interface McpDescFile extends McpDescFileBase {
  info: DumpDetails;
}

interface DumpDetails extends DumpDetailsBase {
  info: {
    sessionIdSupported: boolean;
    sessionIdHeader?: string;  // Optional for all versions
    corsConfig?: CorsConfig;   // Optional for all versions
  };
}
```

Pros:
- Single unified type
- Easy to use
- Optional fields for version-specific features

Cons:
- Less type safety
- Can't enforce version-specific requirements
- Runtime checks needed

**Option C: json-schema-to-typescript Generation**
```bash
# Generate TypeScript types from each schema version
json-schema-to-typescript schemas/mcpdesc-schema-0.4.0.json > src/lib/types/dump-0.4.0.ts
```

Pros:
- Types automatically match schema
- No manual maintenance
- Always in sync with validation

Cons:
- Build-time dependency
- Generated code in repo (or build step)
- Limited control over type names

**Recommendation**: **Option B** (Common Base + Extensions) for pragmatism
- Use optional fields for version-specific features
- Schema validation enforces version-specific requirements
- Runtime code uses feature detection (Option C from previous section)
- Simpler than full union types, adequate type safety
- Consider Option C (generation) if types become unwieldy

## Recommended Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       McpDescLoader                            │
│                                                             │
│  1. Load YAML/JSON file                                     │
│  2. Parse version field                                     │
│  3. Select schema for version                               │
│  4. Validate with version-specific validator                │
│  5. Return typed McpDescFile                                   │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ McpDescFile
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      MockServer                             │
│                                                             │
│  1. Extract features from mcpdesc (feature detection)          │
│  2. Configure server based on present features              │
│  3. Enable version-specific behaviors conditionally         │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
schemas/
  mcpdesc-schema-0.3.1.json
  mcpdesc-schema-0.4.0.json
  mcpdesc-schema-0.4.1.json  # Future

src/lib/
  mcpdesc-loader.ts          # Multi-version validator
  schema-versions.ts      # Version registry and support policy
  types.ts                # Common types with optional fields
  mock-server.ts          # Feature-based runtime behavior
```

### Implementation Plan

#### Phase 1: Schema Storage & Loading

```typescript
// src/lib/schema-versions.ts
export const SUPPORTED_SCHEMA_VERSIONS = {
  '0.3.1': {
    url: 'https://developer.cisco.com/mcp-description/schema/0.3.1',
    schemaFile: 'mcpdesc-schema-0.3.1.json',
    supported: true,
    deprecated: false,
    features: ['basic', 'sessionIdSupported']
  },
  '0.4.0': {
    url: 'https://developer.cisco.com/mcp-description/schema/0.4.0',
    schemaFile: 'mcpdesc-schema-0.4.0.json',
    supported: true,
    deprecated: false,
    features: ['basic', 'sessionIdSupported', 'sessionIdHeader']
  },
  '0.4.1': {
    url: 'https://developer.cisco.com/mcp-description/schema/0.4.1',
    schemaFile: 'mcpdesc-schema-0.4.1.json',
    supported: true,
    deprecated: false,
    features: ['basic', 'sessionIdSupported', 'sessionIdHeader', 'cors']
  }
} as const;

export type SchemaVersion = keyof typeof SUPPORTED_SCHEMA_VERSIONS;

export function getSupportedVersionUrls(): string[] {
  return Object.values(SUPPORTED_SCHEMA_VERSIONS)
    .filter(v => v.supported)
    .map(v => v.url);
}

export function getSchemaFileForVersion(versionUrl: string): string | null {
  const entry = Object.values(SUPPORTED_SCHEMA_VERSIONS)
    .find(v => v.url === versionUrl);
  return entry?.schemaFile ?? null;
}
```

#### Phase 2: Multi-Validator McpDescLoader

```typescript
// src/lib/mcpdesc-loader.ts
export class McpDescLoader {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
  }

  private async getValidator(versionUrl: string): Promise<ValidateFunction> {
    // Return cached validator if available
    if (this.validators.has(versionUrl)) {
      return this.validators.get(versionUrl)!;
    }

    // Load and compile schema for this version
    const schemaFile = getSchemaFileForVersion(versionUrl);
    if (!schemaFile) {
      throw new UnsupportedSchemaVersionError(
        versionUrl,
        getSupportedVersionUrls()
      );
    }

    const schemaPath = new URL(
      `../../schemas/${schemaFile}`,
      import.meta.url
    ).pathname;
    
    const schemaContent = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    const validator = this.ajv.compile(schema);

    // Cache for future use
    this.validators.set(versionUrl, validator);
    return validator;
  }

  async load(filePath: string): Promise<McpDescFile> {
    // Load and parse mcpdesc file
    const dump = await loadYamlOrJson(filePath);

    // Check version field
    if (typeof dump !== 'object' || dump === null) {
      throw new McpDescLoadError('McpDesc file must be a JSON object', filePath);
    }

    const version = (dump as { version?: unknown }).version;
    if (typeof version !== 'string') {
      throw new McpDescLoadError('McpDesc file missing "version" field', filePath);
    }

    // Get validator for this version
    const validator = await this.getValidator(version);

    // Validate
    const valid = validator(dump);
    if (!valid) {
      throw new SchemaValidationError(/* ... */);
    }

    return dump as McpDescFile;
  }
}
```

#### Phase 3: Feature Detection in MockServer

```typescript
// src/lib/mock-server.ts
interface ServerFeatures {
  sessionIdHeader?: string;
  corsConfig?: {
    allowedOrigins: string[];
    allowedMethods: string[];
    // ...
  };
}

export class MockServer {
  private features: ServerFeatures = {};

  private extractFeatures(dump: McpDescFile): ServerFeatures {
    const features: ServerFeatures = {};

    // Extract session ID header if present
    const sessionIdHeader = dump.info?.info?.sessionIdHeader;
    if (typeof sessionIdHeader === 'string') {
      features.sessionIdHeader = sessionIdHeader;
    }

    // Extract CORS config if present (0.4.1+)
    const corsConfig = dump.info?.corsConfig;
    if (corsConfig) {
      features.corsConfig = corsConfig;
    }

    return features;
  }

  async start(options: RunOptions): Promise<void> {
    const dump = await this.loader.load(options.dump);
    this.features = this.extractFeatures(dump);

    if (options.port) {
      await this.startHttpServer(options.port);
    } else {
      await this.startStdioServer();
    }
  }

  private async startHttpServer(port: number): Promise<void> {
    // Apply features conditionally
    if (this.features.sessionIdHeader) {
      this.log(`Session ID header: ${this.features.sessionIdHeader}`);
      // Enable session handling
    }

    if (this.features.corsConfig) {
      this.log('Enabling CORS');
      // Configure CORS middleware
    }

    // Start server
  }
}
```

### Version Support Lifecycle

**Support Policy**:
1. Current version: Fully supported
2. N-1 version: Fully supported
3. Older versions: Deprecated with 6-month sunset period
4. After sunset: Removed from `SUPPORTED_SCHEMA_VERSIONS`

**Deprecation Process**:
1. Mark version as `deprecated: true` in `schema-versions.ts`
2. Log warning when loading deprecated dumps
3. Update README with deprecation notice
4. Wait 6 months
5. Remove schema file and version entry

**Example Warning**:
```
⚠️  Warning: McpDesc schema version 0.3.1 is deprecated and will be removed in mcpmock v0.8.0 (June 2026)
   Please upgrade to mcpcontract 0.17.0+ to generate dumps with schema 0.4.0+
```

## Migration Path

### For mcpmock Maintainers

**When mcpcontract releases new mcpdesc schema version**:

1. Copy new schema file from mcpcontract:
   ```bash
   cp ../mcp-contract/schemas/mcpdesc-schema.json schemas/mcpdesc-schema-0.X.Y.json
   ```

2. Update `schema-versions.ts`:
   ```typescript
   '0.X.Y': {
     url: 'https://developer.cisco.com/mcp-description/schema/0.X.Y',
     schemaFile: 'mcpdesc-schema-0.X.Y.json',
     supported: true,
     deprecated: false,
     features: ['basic', 'newFeature']
   }
   ```

3. Update types if needed (add optional fields for new features)

4. Update mock server feature extraction if needed

5. Add tests for new version

6. Update README with supported versions

7. Consider deprecating old versions per support policy

### For mcpmock Users

**No action required** - mcpmock automatically detects mcpdesc version and uses appropriate validation and features.

**To upgrade dumps**:
```bash
# Regenerate dumps with latest mcpcontract
mcpcontract convert --url http://localhost:3000/mcp --output dump.yaml
```

## Testing Strategy

### Unit Tests

1. **Schema Loading**: Test each supported version loads correctly
2. **Validation**: Test version-specific validation rules
3. **Feature Extraction**: Test feature detection for each version
4. **Version Detection**: Test unsupported version rejection

### Integration Tests

1. **Multi-Version Dumps**: Test mcpmock run/record with all supported versions
2. **Feature Behavior**: Test session ID, CORS, etc., work correctly
3. **Version Mixing**: Test handling multiple dumps with different versions
4. **Deprecation Warnings**: Test warnings appear for deprecated versions

### Test Fixtures

```
tests/fixtures/mcpdesc/
  v0.3.1/
    simple.yaml
    with-session.yaml
  v0.4.0/
    simple.yaml
    with-session-header.yaml
  v0.4.1/
    with-cors.yaml
```

## Open Questions

1. **Schema Source of Truth**: Should we copy schemas from mcpcontract or fetch them dynamically?
   - **Recommendation**: Copy on release (offline-first, no runtime dependencies)

2. **Automatic Schema Updates**: Should mcpmock auto-detect and download new schemas?
   - **Recommendation**: No, explicit version management for stability

3. **Version Compatibility Testing**: How to test mcpmock against all mcpcontract versions?
   - **Recommendation**: Include reference dumps in `ref/mcpdesc/` for each supported version

4. **Breaking Changes**: How to handle breaking changes in mock server behavior?
   - **Recommendation**: Version behavior behind feature flags, document in CHANGELOG

5. **Performance Impact**: How much overhead does multi-version validation add?
   - **Recommendation**: Measure with benchmarks, optimize if >10% overhead

## Success Criteria

- ✅ Support at least 2 schema versions simultaneously (0.3.1 and 0.4.0)
- ✅ Zero breaking changes for users with existing dumps
- ✅ Clear documentation of supported versions and deprecation policy
- ✅ Feature-based runtime behavior (not version checks)
- ✅ <100ms additional load time for multi-version support
- ✅ All existing tests pass with both schema versions
- ✅ New version addition requires <30 minutes of work

## Next Steps

1. **Review & Feedback**: Team review of this design document
2. **Prototype**: Implement Phase 1 (schema storage) with 0.3.1 + 0.4.0
3. **Validate**: Test with real dumps from both versions
4. **Refine**: Adjust based on findings
5. **Implement**: Roll out Phases 2-3
6. **Document**: Update README, AGENTS.md, tutorials
7. **Release**: Version 0.6.0 with multi-version support

## References

- **JSON Schema Best Practices**: https://json-schema.org/understanding-json-schema/
- **Semantic Versioning**: https://semver.org/
- **TypeScript Discriminated Unions**: https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html
- **mcpcontract CHANGELOG**: `ref/mcp-contract/CHANGELOG.md`

---

**Document Status**: Ready for Review  
**Target Version**: mcpmock 0.6.0  
**Estimated Effort**: 2-3 days implementation + testing
