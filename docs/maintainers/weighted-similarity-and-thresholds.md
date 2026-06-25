# Weighted Similarity and Threshold Strategies

**Status**: Design/Brainstorming  
**Date**: 2026-01-07  
**Author**: Design exploration for weighted parameter matching and comprehensive threshold documentation

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Weighted Similarity Proposal](#weighted-similarity-proposal)
4. [Threshold Usage Across Commands](#threshold-usage-across-commands)
5. [Type Matching Strategy](#type-matching-strategy)
6. [Scenarios and Trade-offs](#scenarios-and-trade-offs)
7. [Recommendations](#recommendations)

## Overview

### Problem Statement

The current similarity calculation treats all parameters equally when matching recorded traffic or selecting examples. However, in real-world MCP tools:

1. **Parameters have different importance**: Early parameters (like `name`, `id`) are often more critical than later ones (like `limit`, `includeMetadata`)
2. **Thresholds vary by use case**: Different commands and scenarios need different matching strategies
3. **Type matching is underutilized**: When parameter types match but values differ, we could potentially leverage cache/examples more intelligently
4. **Documentation is scattered**: Threshold behavior is not well-documented for users to make informed decisions

### Goals

1. Explore **weighted similarity matching** where parameter position/importance affects matching scores
2. **Catalog all threshold usage** across mcpmock commands
3. **Analyze trade-offs** for different threshold strategies
4. **Document extensively** to help users choose optimal configurations

## Current State Analysis

### 1. Traffic Replayer (`mcpmock run --replay`)

**File**: `src/lib/traffic-replayer.ts`

**Current Behavior**:
- **Threshold**: `--similarity-threshold` (default: 70%)
- **Matching Strategy**: 3-level fallback
  1. **Exact match** (100%): Composite key + argument hash
  2. **Similar match** (≥threshold): Composite key + similarity score
  3. **Faker fallback**: No match found

**Similarity Calculation**:
```typescript
similarity = (matchingKeys + matchingValues) / (totalUniqueKeys * 2)

Where:
- matchingKeys: Number of keys present in both argument sets
- matchingValues: Number of keys with identical values
- totalUniqueKeys: Union of keys from both argument sets
```

**Example**:
```typescript
// Request: {name: "Nexus", kind: "API"}
// Stored:  {name: "Nexus", kind: "SDK"}
// 
// Keys in union: {name, kind} = 2
// Matching keys: {name, kind} = 2
// Matching values: {name} = 1
// Similarity = (2 + 1) / (2 * 2) = 3/4 = 75%
```

**Issues**:
- All parameters weighted equally
- First parameter `name` has same weight as second parameter `kind`
- For search tools, `name` is usually more important than filters like `kind`, `status`, etc.

### 2. Example Selector (`mcpmock run --example-similarity`)

**File**: `src/lib/example-selector.ts`

**Current Behavior**:
- **Threshold**: `--example-similarity` (default: 70%)
- **Selection Strategy**: 2-level fallback
  1. **Similarity matching**: Find best example above threshold
  2. **Round-robin**: Cycle through examples if no good match

**Similarity Calculation**:
```typescript
// Get all unique keys from both inputs
const allKeys = new Set([...exampleKeys, ...actualKeys]);

for each key:
  - If values equal: score += 1.0
  - Else if types match: score += 0.5
  - Else: score += 0.0

similarity = totalScore / allKeys.size
```

**Example**:
```typescript
// Example: {name: "Nexus", kind: "API", status: "ACTIVE"}
// Request: {name: "Nexus", kind: "SDK"}
// 
// All keys: {name, kind, status} = 3
// - name: exact match → 1.0
// - kind: type match (string) → 0.5
// - status: missing in request → 0.0
// Similarity = (1.0 + 0.5 + 0.0) / 3 = 50%
```

**Issues**:
- Same equal weighting problem
- Type matching (0.5 score) is interesting but needs more analysis
- Missing parameters heavily penalize the score

### 3. Build Command

**File**: `src/commands/build.ts`

**Current Behavior**:
- **No explicit threshold** - uses AI generation or faker fallback
- **Relationship analysis**: Detects shared parameters across tools
- **Strategy**: Generate consistent values for shared parameters

**No threshold needed** because:
- Not comparing/matching data
- Only analyzing schema relationships
- AI or faker generates fresh data

## Weighted Similarity Proposal

### Motivation

Consider a search tool with this signature:
```typescript
search({
  name: string,      // Primary search term
  kind?: string,     // Filter
  status?: string,   // Filter
  limit?: number,    // Pagination
  offset?: number    // Pagination
})
```

**Current problem**: All parameters treated equally
```typescript
Request:  {name: "Nexus", kind: "API", limit: 10}
Stored A: {name: "Nexus", kind: "API", limit: 20}  → 67% similar
Stored B: {name: "Nexus", kind: "SDK", limit: 10}  → 67% similar
```

Both matches score the same, but **Stored A is semantically better** because:
- Primary search term matches (`name: "Nexus"`)
- Main filter matches (`kind: "API"`)
- Only pagination differs (`limit`)

### Weighted Algorithm

**Proposal**: Weight parameters by position or semantic importance

#### Strategy 1: Position-based Weighting

```typescript
// For N parameters, assign weights by position
weight[0] = most important (first parameter)
weight[N-1] = least important (last parameter)

// Suggested weight distributions:
2 params: [0.70, 0.30]
3 params: [0.60, 0.30, 0.10]
4 params: [0.50, 0.30, 0.15, 0.05]
5+ params: [0.40, 0.25, 0.20, 0.10, 0.05, ...]
```

**Rationale**:
- MCP tools typically put important params first (name, id, query)
- Optional/filter params come later (limit, offset, includeMetadata)
- Exponential decay reflects real-world importance

#### Strategy 2: Semantic Weighting

```typescript
// Weight based on parameter name patterns
HIGH_PRIORITY = ["name", "id", "query", "search", "key"]     // 1.0
MED_PRIORITY = ["kind", "type", "status", "category"]        // 0.6
LOW_PRIORITY = ["limit", "offset", "page", "size", "meta"]   // 0.2
```

**Rationale**:
- Parameter semantics matter more than position
- More explicit about what makes a parameter important
- Harder to configure (requires parameter name heuristics)

#### Strategy 3: Hybrid Approach

```typescript
// Combine position and semantic weighting
weight = (position_weight * 0.5) + (semantic_weight * 0.5)
```

**Rationale**:
- Best of both worlds
- Handles cases where important params aren't first
- Most flexible but more complex

### Implementation Sketch

```typescript
interface WeightConfig {
  strategy: 'position' | 'semantic' | 'hybrid' | 'equal';
  positionWeights?: number[];  // [0.6, 0.3, 0.1]
  semanticRules?: {
    high: string[];
    medium: string[];
    low: string[];
  };
}

function calculateWeightedSimilarity(
  args1: Record<string, unknown>,
  args2: Record<string, unknown>,
  config: WeightConfig
): number {
  const keys = Array.from(new Set([...Object.keys(args1), ...Object.keys(args2)]));
  
  let totalScore = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const weight = getWeight(key, i, keys.length, config);
    
    let score = 0;
    if (key in args1 && key in args2) {
      if (deepEqual(args1[key], args2[key])) {
        score = 1.0;  // Exact match
      } else if (typeof args1[key] === typeof args2[key]) {
        score = 0.5;  // Type match
      }
    }
    
    totalScore += score * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
```

### Examples with Weighted Similarity

#### Example 1: Search Tool (Position-based)

**Configuration**: `position_weights: [0.60, 0.30, 0.10]`

```typescript
Request:  {name: "Nexus", kind: "API", limit: 10}
Stored A: {name: "Nexus", kind: "API", limit: 20}
Stored B: {name: "Nexus", kind: "SDK", limit: 10}

// Current (equal weighting):
Stored A: (2 + 2) / (3 * 2) = 67%
Stored B: (2 + 2) / (3 * 2) = 67%
→ Tie, arbitrary selection

// Weighted (position-based):
Stored A:
- name match: 1.0 * 0.60 = 0.60
- kind match: 1.0 * 0.30 = 0.30
- limit type: 0.5 * 0.10 = 0.05
Total: (0.60 + 0.30 + 0.05) / (0.60 + 0.30 + 0.10) = 0.95 / 1.0 = 95%

Stored B:
- name match: 1.0 * 0.60 = 0.60
- kind type: 0.5 * 0.30 = 0.15
- limit match: 1.0 * 0.10 = 0.10
Total: (0.60 + 0.15 + 0.10) / (0.60 + 0.30 + 0.10) = 0.85 / 1.0 = 85%

→ Stored A wins (95% > 85%)
```

#### Example 2: Get Tool (Semantic weighting)

**Configuration**: `semantic: {high: ["id"], medium: ["includeDetails"], low: ["format"]}`

```typescript
Request:  {id: "CN-123", includeDetails: true, format: "json"}
Stored A: {id: "CN-123", includeDetails: true, format: "yaml"}
Stored B: {id: "CN-456", includeDetails: true, format: "json"}

// Weighted (semantic):
Stored A:
- id match: 1.0 * 1.0 (high) = 1.0
- includeDetails match: 1.0 * 0.6 (medium) = 0.6
- format type: 0.5 * 0.2 (low) = 0.1
Total: (1.0 + 0.6 + 0.1) / (1.0 + 0.6 + 0.2) = 1.7 / 1.8 = 94%

Stored B:
- id type: 0.5 * 1.0 (high) = 0.5
- includeDetails match: 1.0 * 0.6 (medium) = 0.6
- format match: 1.0 * 0.2 (low) = 0.2
Total: (0.5 + 0.6 + 0.2) / (1.0 + 0.6 + 0.2) = 1.3 / 1.8 = 72%

→ Stored A wins (94% > 72%) despite wrong format
```

## Threshold Usage Across Commands

### Command Matrix

| Command | Option | Default | Range | Strategy | Purpose |
|---------|--------|---------|-------|----------|---------|
| `run --replay` | `--similarity-threshold` | 70% | 1-100 | 3-level (exact → similar → faker) | Match recorded traffic to requests |
| `run` | `--example-similarity` | 70% | 1-100 | 2-level (similar → round-robin) | Select examples from mcpdesc |
| `build` | N/A | N/A | N/A | AI/Faker generation | Generate fresh mock data |
| `record` | N/A | N/A | N/A | No matching | Record all traffic |
| `import` | N/A | N/A | N/A | No matching | Convert mcptest logs |

### Detailed Analysis

#### 1. `mcpmock run --replay --similarity-threshold <percent>`

**Purpose**: Match incoming requests to recorded responses

**Scenarios**:

| Threshold | Behavior | Use Case | Pros | Cons |
|-----------|----------|----------|------|------|
| **100%** | Only exact matches | Strict replay, testing exact flows | High confidence in match accuracy | Low coverage, frequent faker fallbacks |
| **80-90%** | High similarity required | Production-like mocking | Good balance of accuracy and coverage | Some valid matches may be missed |
| **70%** (default) | Moderate similarity | General development/testing | Reasonable coverage and accuracy | Some false positives possible |
| **50-60%** | Low similarity accepted | Exploratory testing, prototyping | High coverage, fewer faker fallbacks | More false positives, wrong schemas possible |
| **1-40%** | Very low bar | Not recommended | Maximum coverage | High risk of semantic mismatches |

**Example Scenarios**:

```bash
# Scenario 1: Strict CI/CD testing
# Want to ensure exact flows are tested, no fuzzy matching
mcpmock run api.yaml --replay traffic.jsonl --similarity-threshold 100

# Scenario 2: Development server
# Want reasonable flexibility for manual testing
mcpmock run api.yaml --replay traffic.jsonl --similarity-threshold 70

# Scenario 3: Load testing with variations
# Want to match even with different pagination/filters
mcpmock run api.yaml --replay traffic.jsonl --similarity-threshold 50
```

#### 2. `mcpmock run --example-similarity <percent>`

**Purpose**: Select best example response from mcpdesc's `responseExamples` array

**Scenarios**:

| Threshold | Behavior | Use Case | Pros | Cons |
|-----------|----------|----------|------|------|
| **100%** | Only exact input matches | Deterministic testing | Predictable responses | Limited example reuse |
| **80-90%** | High similarity to examples | Production-like data | Realistic responses from examples | May fall back to round-robin often |
| **70%** (default) | Moderate similarity | General development | Good example reuse | Some parameter mismatches |
| **50-60%** | Low similarity accepted | Maximize example usage | Uses examples more often | Examples may not match intent |
| **1-40%** | Very low bar | Force example usage | Always uses examples (no round-robin) | Examples likely semantically wrong |

**Example Scenarios**:

```bash
# Scenario 1: Use examples only when they match well
# Fall back to round-robin otherwise (diverse data)
mcpmock run api.yaml --example-similarity 80

# Scenario 2: More flexible example matching
# Good for tools with many parameter variations
mcpmock run api.yaml --example-similarity 60

# Scenario 3: Strict example usage
# Only use example if parameters are nearly identical
mcpmock run api.yaml --example-similarity 95
```

### Interaction Between Thresholds

**Combined usage**:
```bash
mcpmock run \
  --mcpdesc api.yaml \
  --replay traffic.jsonl \
  --similarity-threshold 80 \     # Replay threshold
  --example-similarity 70          # Example threshold
```

**Decision tree** for `tools/call`:
1. **Check replay**: Does recorded traffic have this request?
   - Exact match (100%)? → Use recorded response ✅
   - Similar match (≥80%)? → Use recorded response ✅
   - No match (< 80%)? → Continue to step 2
2. **Check examples**: Does dump have `responseExamples` for this tool?
   - Similar example (≥70%)? → Use example response ✅
   - No match (< 70%)? → Continue to step 3
3. **Check overrides**: Does `--data` directory have override for this tool?
   - Override exists? → Use override ✅
   - No override? → Continue to step 4
4. **Faker fallback**: Generate mock data with Faker ⚙️

## Type Matching Strategy

### Current Behavior

Both systems use type matching as a partial credit:

```typescript
// Example Selector
if (values equal) {
  score += 1.0;
} else if (typeof a === typeof b) {
  score += 0.5;  // Type match but value different
} else {
  score += 0.0;
}

// Traffic Replayer
if (values equal) {
  matchingValues++;
}
// No partial credit for type match
```

### Proposal: Cache on Type Match

**Idea**: When parameter types match but values differ, could we reuse cached/recorded responses?

#### Scenario 1: Cached Response Reuse

```typescript
// First call: {id: "CN-123"}
// → Generate/fetch response, cache it

// Second call: {id: "CN-456"} 
// Question: Reuse cached response from "CN-123"?
```

**Analysis**:

| Approach | Pros | Cons |
|----------|------|------|
| **Reuse** | Faster, consistent structure | Semantically wrong (data for wrong ID) |
| **Don't reuse** | Semantically correct | Slower (generate new), less consistency |
| **Hybrid** (transform) | Best of both worlds | Complex, requires schema understanding |

**Recommendation**: **Don't reuse** for most cases, but consider **transform option**:

```typescript
interface TypeMatchStrategy {
  cache: 'never' | 'transform' | 'always';
}

// Transform strategy (advanced):
// - Use cached response as template
// - Replace ID-like fields with requested values
// - Keep structure/non-ID fields the same

Example:
Cached: {id: "CN-123", name: "Nexus Dashboard", org: "CN"}
Request: {id: "CN-456"}
Transform → {id: "CN-456", name: "Nexus Dashboard", org: "CN"}
//           ↑ Replaced      ↑ Kept (template)    ↑ Kept
```

#### Scenario 2: Replay Traffic Type Match

```typescript
// Request:  {name: "Nexus", kind: "API"}
// Recorded: {name: "Meraki", kind: "API"}
// Similarity: (1/2 keys match) + (0/2 values match) = 25%

// With type matching bonus:
// Similarity: (2/2 keys match) + (1/2 type match) = 62.5%
```

**Question**: Should type match increase similarity score in traffic replay?

**Recommendation**: **Yes, but conservatively**

```typescript
// Current:
similarity = (matchingKeys + matchingValues) / (totalKeys * 2)

// Proposed (with type matching):
similarity = (matchingKeys + matchingValues + (typeMatches * 0.25)) / (totalKeys * 2.25)
//                                            ↑ Partial credit       ↑ Adjusted denominator

// Effect:
// - Exact match: still 100%
// - Type match: adds ~11% boost (instead of 0%)
// - More generous but not too permissive
```

## Scenarios and Trade-offs

### Scenario 1: CI/CD Testing (High Precision)

**Goal**: Ensure exact request/response pairs are tested, no fuzzy matching

**Configuration**:
```bash
mcpmock run \
  --mcpdesc contract.yaml \
  --replay golden-traffic.jsonl \
  --similarity-threshold 100 \
  --example-similarity 95 \
  --verbose
```

**Trade-offs**:
- ✅ High confidence: Responses match intended requests
- ✅ Catches regressions: Changes in request parameters fail tests
- ❌ Low coverage: Any parameter variation triggers faker fallback
- ❌ Brittle: Adding optional parameters breaks tests

**When to use**: Contract testing, regression testing, API compatibility checks

### Scenario 2: Development Server (Balanced)

**Goal**: Provide realistic data for manual testing with some flexibility

**Configuration**:
```bash
mcpmock run \
  --mcpdesc contract.yaml \
  --replay dev-traffic.jsonl \
  --similarity-threshold 70 \
  --example-similarity 70 \
  --data ./mock-overrides
```

**Trade-offs**:
- ✅ Good coverage: Most requests match recorded/example data
- ✅ Flexible: Handles parameter variations reasonably
- ⚠️ Moderate risk: ~5-10% false positives (wrong data for request)
- ✅ Easy to debug: `--verbose` shows matching decisions

**When to use**: Local development, feature testing, demos

### Scenario 3: Load Testing (High Coverage)

**Goal**: Maximize response coverage, minimize faker usage (faster)

**Configuration**:
```bash
mcpmock run \
  --mcpdesc contract.yaml \
  --replay load-test-traffic.jsonl \
  --similarity-threshold 50 \
  --example-similarity 60
```

**Trade-offs**:
- ✅ Maximum coverage: Nearly all requests match something
- ✅ Performance: Fewer faker generations (faster)
- ❌ Low precision: Many semantic mismatches
- ❌ False confidence: Wrong data looks "real"

**When to use**: Performance testing (response structure matters, not content), stress testing

### Scenario 4: Exploration/Prototyping (Faker-heavy)

**Goal**: Get something working quickly, don't worry about data accuracy

**Configuration**:
```bash
mcpmock run \
  --mcpdesc contract.yaml \
  --similarity-threshold 100 \  # Forces faker for any variation
  --example-similarity 100       # Rarely uses examples
```

**Trade-offs**:
- ✅ Fast setup: No traffic recording needed
- ✅ Flexible: Handles any parameter combination
- ❌ Unrealistic data: Faker generates random garbage
- ❌ No consistency: Each call gets different data

**When to use**: Initial prototyping, schema validation, UI layout testing

### Scenario 5: Weighted Matching (Future)

**Goal**: Prioritize important parameters (name, id) over filters (limit, offset)

**Configuration** (hypothetical):
```bash
mcpmock run \
  --mcpdesc contract.yaml \
  --replay traffic.jsonl \
  --similarity-threshold 70 \
  --weighted-strategy position \  # NEW
  --position-weights 0.6,0.3,0.1  # NEW
```

**Trade-offs**:
- ✅ Smarter matching: Prioritizes semantically important params
- ✅ Better coverage: Matches more requests correctly
- ⚠️ Complexity: Users need to understand weighting
- ⚠️ Configuration burden: Need to tune weights

**When to use**: Complex APIs with many optional parameters, search/filter tools

## Recommendations

### 1. Default Threshold Values

**Keep current defaults** (70%) - good balance for most users:
```typescript
--similarity-threshold: 70    // Replay matching
--example-similarity: 70      // Example selection
```

### 2. Weighted Similarity Implementation

**Phase 1** (v0.8.0): Add position-based weighting as opt-in
```bash
mcpmock run \
  --mcpdesc api.yaml \
  --replay traffic.jsonl \
  --weighted-matching  # Enable weighted similarity (experimental)
```

**Phase 2** (v0.9.0): Refine based on feedback, add configuration
```bash
mcpmock run \
  --weighted-strategy position \
  --position-weights 0.6,0.3,0.1
```

**Phase 3** (v1.0.0): Add semantic and hybrid strategies

### 3. Type Matching Enhancement

**Add conservative type matching** to traffic replayer:
```typescript
// Add 11% boost for type matches (not just key matches)
similarity = (keyMatches + valueMatches + (typeMatches * 0.25)) / (totalKeys * 2.25)
```

**Add cache transformation** as opt-in:
```bash
mcpmock run --cache-strategy transform
```

### 4. Documentation Improvements

**Add to README.md**:
- Threshold decision guide (table with scenarios)
- Example configurations for common use cases

**Create new guide**: `docs/tutorials/tuning-thresholds.md`
- Deep dive into threshold behavior
- Examples with real API scenarios
- Troubleshooting guide (too strict? too loose?)

**Update existing guides**:
- `docs/tutorials/recording-traffic.md` - Add threshold tuning section
- `docs/tutorials/manual-mocks.md` - Explain example similarity

## Open Questions

1. **Default weights**: What position weights work best across APIs?
   - Need empirical testing with real APIs
   - Consider user survey on parameter importance

2. **Semantic rules**: Can we auto-detect important parameters?
   - Analyze parameter names (id, name, query → high priority)
   - Analyze parameter order in inputSchema
   - Learn from recorded traffic patterns

3. **Performance**: Does weighted matching impact performance?
   - Need benchmarks with large traffic files
   - Consider caching weight calculations

4. **User experience**: How to make weighted matching easy to configure?
   - Auto-detect strategy from API patterns?
   - Provide presets (strict, balanced, flexible)?
   - Interactive tuning mode (`--tune-weights`)?

5. **Cache invalidation**: When should cached responses be invalidated?
   - Time-based (TTL)?
   - Request count-based?
   - Parameter similarity threshold?

## Next Steps

1. ✅ Create this design document
2. ⬜ Gather feedback from users on threshold pain points
3. ⬜ Implement weighted matching prototype (position-based)
4. ⬜ Add comprehensive threshold documentation to README
5. ⬜ Create `tuning-thresholds.md` tutorial with examples
6. ⬜ Benchmark performance of weighted matching
7. ⬜ Consider adding `--preset` option (strict/balanced/flexible)
8. ⬜ Add telemetry to track threshold effectiveness in real usage

## References

- [similarity-threshold.md](./similarity-threshold.md) - Original threshold implementation
- [phase2-http-recording.md](./phase2-http-recording.md) - Traffic recording design
- [phase3-ai-builder.md](./phase3-ai-builder.md) - AI-assisted mock generation
- MCP Specification: https://spec.modelcontextprotocol.io/
