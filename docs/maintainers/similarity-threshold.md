# Similarity Threshold for Traffic Replay

**Status**: Implemented (v0.7.0)  
**Date**: 2026-01-04

## Problem Statement

When replaying recorded MCP traffic, the matching algorithm needs to balance between:
1. **Accuracy**: Returning responses that match the request semantically
2. **Coverage**: Providing a response even when no perfect match exists

The initial implementation used a 3-level matching strategy:
- **Level 1**: Exact match (composite key + argument hash)
- **Level 2**: Similar match (composite key + similarity score)
- **Level 3**: Method-only match (ignoring tool name)

However, **Level 3 is problematic** because different MCP tools have incompatible schemas:
- `tools/call:search` expects `{name: string, kind?: string}`
- `tools/call:get-card` expects `{id: string}`
- `prompts/get:example` expects `{name: string, arguments?: object}`

Returning a `get-card` response to a `search` request would provide data in the wrong format, causing client errors.

Similarly, **Level 2 without a quality threshold** could return low-similarity matches that are semantically wrong:
- Request: `search({name: "Nexus", kind: "API"})`
- Match: `search({name: "Meraki"})` (similarity: 33% - only "name" key matches)
- Result: Wrong product data returned

## Design Decision

### Matching Strategy (Revised)

Remove Level 3 and add quality threshold to Level 2:

1. **Level 1: Exact Match** (100% similarity)
   - Composite key: `method:toolname` (e.g., `tools/call:search`)
   - Argument hash: MD5 of sorted arguments (exact match)
   - **Action**: Return recorded response

2. **Level 2: Similar Match** (≥ threshold)
   - Composite key: `method:toolname` matches
   - Similarity score: ≥ configured threshold (default: 70%)
   - **Action**: Return best-match recorded response
   - **Debug**: Log similarity percentage

3. **Level 3: Faker Fallback** (< threshold or no composite key match)
   - No acceptable recorded match found
   - **Action**: Use Faker to generate mock data
   - **Debug**: Log reason (similarity too low / no composite key match)

### Similarity Calculation

Similarity score is based on argument overlap:

```typescript
similarity = (matchingKeys + matchingValues) / (totalUniqueKeys * 2)
```

Where:
- `matchingKeys`: Number of keys present in both argument sets
- `matchingValues`: Number of keys with identical values
- `totalUniqueKeys`: Union of keys from both argument sets

**Example**:
```typescript
// Request arguments
{name: "Nexus", kind: "API"}

// Candidate 1: Stored response arguments
{name: "Nexus", kind: "API", status: "ACTIVE"}
// Keys: {name, kind, status} = 3
// Matching keys: {name, kind} = 2
// Matching values: {name=Nexus, kind=API} = 2
// Similarity = (2 + 2) / (3 * 2) = 4/6 = 67% ❌ Below threshold

// Candidate 2: Stored response arguments
{name: "Nexus", kind: "API"}
// Keys: {name, kind} = 2
// Matching keys: {name, kind} = 2
// Matching values: {name=Nexus, kind=API} = 2
// Similarity = (2 + 2) / (2 * 2) = 4/4 = 100% ✅ Exact match

// Candidate 3: Stored response arguments
{name: "Meraki"}
// Keys: {name, kind} (union) = 2
// Matching keys: {name} = 1
// Matching values: {} = 0
// Similarity = (1 + 0) / (2 * 2) = 1/4 = 25% ❌ Below threshold
```

### Configuration

**CLI Option**: `--similarity-threshold <percent>`
- Type: Number (1-100)
- Default: 70
- Range: 1-100 (validated)
- Description: "Minimum similarity percentage for replay matches (1-100, default: 70)"

**Example Usage**:
```bash
# Default (70% threshold)
mcpmock run contract.yaml --replay traffic.jsonl

# Strict matching (90% threshold)
mcpmock run contract.yaml --replay traffic.jsonl --similarity-threshold 90

# Permissive matching (50% threshold)
mcpmock run contract.yaml --replay traffic.jsonl --similarity-threshold 50

# With debug output
mcpmock run contract.yaml --replay traffic.jsonl --similarity-threshold 80 --debug
```

### Debug Output

When `--debug` is enabled, the matching logic provides detailed visibility:

**Level 1: Exact Match**
```
[DEBUG] Request: tools/call (search) with arguments: {"name":"Nexus","kind":"API"}
[DEBUG] Composite key: tools/call:search
[DEBUG] Arguments hash: a1b2c3d4
[DEBUG] Found 4 candidates for composite key
[DEBUG] ✓ Level 1: Exact match (hash: a1b2c3d4)
✓ Replayed from recording (2026-01-04 14:23:15)
```

**Level 2: Similar Match**
```
[DEBUG] Request: tools/call (search) with arguments: {"name":"Nexus","kind":"API","status":"ACTIVE"}
[DEBUG] Composite key: tools/call:search
[DEBUG] Arguments hash: e5f6g7h8
[DEBUG] Found 4 candidates for composite key
[DEBUG] No exact match found
[DEBUG] Candidate 1: hash a1b2c3d4, similarity 83.33% ✓
[DEBUG] Candidate 2: hash i9j0k1l2, similarity 66.67% ✗ (below 70% threshold)
[DEBUG] Candidate 3: hash m3n4o5p6, similarity 50.00% ✗ (below 70% threshold)
[DEBUG] Candidate 4: hash q7r8s9t0, similarity 33.33% ✗ (below 70% threshold)
[DEBUG] ✓ Level 2: Best similar match (83.33% similarity)
✓ Replayed from recording (2026-01-04 14:25:30)
```

**Level 3: Faker Fallback**
```
[DEBUG] Request: tools/call (search) with arguments: {"name":"Catalyst"}
[DEBUG] Composite key: tools/call:search
[DEBUG] Arguments hash: u1v2w3x4
[DEBUG] Found 4 candidates for composite key
[DEBUG] No exact match found
[DEBUG] Candidate 1: hash a1b2c3d4, similarity 40.00% ✗ (below 70% threshold)
[DEBUG] Candidate 2: hash i9j0k1l2, similarity 33.33% ✗ (below 70% threshold)
[DEBUG] Candidate 3: hash m3n4o5p6, similarity 25.00% ✗ (below 70% threshold)
[DEBUG] Candidate 4: hash q7r8s9t0, similarity 16.67% ✗ (below 70% threshold)
[DEBUG] ✗ No match above 70% threshold, using Faker
→ tools/call (faker generated)
```

**No Composite Key Match**
```
[DEBUG] Request: tools/call (unknown-tool) with arguments: {"id":"123"}
[DEBUG] Composite key: tools/call:unknown-tool
[DEBUG] No candidates found for composite key
[DEBUG] ✗ No recorded responses for this tool, using Faker
→ tools/call (faker generated)
```

## Implementation

### Files Modified

1. **src/lib/types.ts**
   - Added `similarityThreshold?: number` to `RunOptions`

2. **src/lib/traffic-replayer.ts**
   - Added `similarityThreshold` parameter to constructor (default: 70)
   - Modified `getResponse()` to check similarity against threshold
   - Removed method-only fallback (Level 3)
   - Enhanced debug output with similarity percentages and threshold checks

3. **src/commands/run.ts**
   - Added `--similarity-threshold <percent>` CLI option
   - Added validation (1-100 range)
   - Pass threshold to `TrafficReplayer` constructor

4. **src/commands/completion.ts**
   - Added `--similarity-threshold` to bash/zsh/fish completions

### Backward Compatibility

**Breaking Changes**: None

- The default threshold (70%) maintains reasonable balance between accuracy and coverage
- Existing commands without `--similarity-threshold` work unchanged
- Recorded traffic files (JSONL format) remain compatible

**Migration**: No migration needed. Users can:
1. Keep using existing replay commands (gets 70% threshold)
2. Tune threshold if needed: `--similarity-threshold 80`
3. Enable debug mode to observe matching behavior: `--debug`

## Rationale

### Why 70% Default?

The 70% threshold was chosen based on:

1. **Semantic Meaning**: 70% similarity means at least 70% of argument structure matches
   - High enough to avoid completely wrong matches
   - Low enough to handle extra fields in recordings

2. **Practical Examples**:
   - ✅ 100%: `{name: "Nexus"}` → `{name: "Nexus"}` (exact)
   - ✅ 83%: `{name: "Nexus", kind: "API"}` → `{name: "Nexus", kind: "API", status: "ACTIVE"}` (extra field in recording)
   - ✅ 75%: `{name: "Nexus", kind: "API"}` → `{name: "Nexus", kind: "SDK"}` (similar structure, different value)
   - ❌ 50%: `{name: "Nexus", kind: "API"}` → `{name: "Meraki"}` (wrong product)
   - ❌ 33%: `{name: "Nexus", kind: "API", status: "ACTIVE"}` → `{name: "Meraki"}` (very different)

3. **User Control**: Users can tune based on their needs:
   - **Strict mode** (90%+): Only near-exact matches, prefer Faker for edge cases
   - **Balanced mode** (70%): Default, good accuracy/coverage trade-off
   - **Permissive mode** (50%): Maximize replay usage, accept looser matches

### Why Remove Method-Only Fallback?

Method-only matching (Level 3) is fundamentally flawed:

1. **Schema Incompatibility**: Different tools have different argument structures
   - Returning `get-card` response to `search` request causes type errors

2. **Semantic Mismatch**: Even for same method, wrong tool = wrong context
   - `prompts/get:example` vs `prompts/get:template` serve different purposes

3. **Better Alternative**: Faker generates valid mock data that matches the tool's schema
   - Type-safe: Respects tool's input schema from contract
   - Consistent: Same arguments = same generated response (cache)
   - Debuggable: Clear indication via `(faker generated)` log

## Testing

**Manual Testing**:
```bash
# Test with default threshold
mcpmock run examples/inventory/contract-2.6.3.yaml \
  --replay tests/mock-data/traffic.jsonl \
  --debug

# Test with strict threshold
mcpmock run examples/inventory/contract-2.6.3.yaml \
  --replay tests/mock-data/traffic.jsonl \
  --similarity-threshold 90 \
  --debug

# Test with permissive threshold
mcpmock run examples/inventory/contract-2.6.3.yaml \
  --replay tests/mock-data/traffic.jsonl \
  --similarity-threshold 50 \
  --debug
```

**Expected Behavior**:
- Default (70%): Most requests replay, some use Faker
- Strict (90%): More Faker usage for non-exact matches
- Permissive (50%): More replay usage, fewer Faker calls

**Integration Tests**: See `tests/integration/replay-similarity.test.ts`

## Future Enhancements

1. **Auto-tuning**: Analyze traffic file and suggest optimal threshold
2. **Per-tool Thresholds**: Configure different thresholds for different tools
3. **Similarity Metrics**: Add Levenshtein distance for string values
4. **Match Confidence**: Include confidence score in responses (via headers)

## References

- **Issue**: Traffic replay matching improvement
- **PR**: #XXX
- **Related Docs**: 
  - [Phase 2: HTTP Recording](phase2-http-recording.md)
  - [mcpmock Design](mcpmock-design.md)
