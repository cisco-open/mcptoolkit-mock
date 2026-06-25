# Tutorial: CI/CD Testing

Learn how to use mcpmock in your CI/CD pipelines for automated testing.

## Overview

mcpmock enables **deterministic testing** in CI/CD:
- No external dependencies (no real API calls)
- Fast test execution
- Reproducible results
- Easy setup

## Quick Start

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test with mcpmock

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install mcpmock
        run: npm install -g mcpmock
      
      - name: Generate mocks
        run: |
          mcpmock build \
            --mcpdesc tests/fixtures/api.mcpdesc.json \
            --output mocks/ \
            --no-ai
      
      - name: Start mock server
        run: |
          mcpmock run \
            --mcpdesc tests/fixtures/api.mcpdesc.json \
            --data mocks/ \
            --transport streamable-http \
            --port 3000 &
          sleep 2  # Wait for server to start
      
      - name: Run tests
        run: npm test
        env:
          API_URL: http://localhost:3000/v1/mcp
```

### GitLab CI

```yaml
# .gitlab-ci.yml
test:
  image: node:20
  before_script:
    - npm install -g mcpmock
  script:
    - mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --no-ai
    - mcpmock run api.mcpdesc.json --data mocks/ --port 3000 &
    - sleep 2
    - npm test
  variables:
    API_URL: "http://localhost:3000/v1/mcp"
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g mcpmock'
            }
        }
        
        stage('Generate Mocks') {
            steps {
                sh 'mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --no-ai'
            }
        }
        
        stage('Test') {
            steps {
                sh '''
                    mcpmock run api.mcpdesc.json --data mocks/ --port 3000 &
                    MOCK_PID=$!
                    sleep 2
                    npm test
                    kill $MOCK_PID
                '''
            }
        }
    }
    
    environment {
        API_URL = 'http://localhost:3000/v1/mcp'
    }
}
```

## Using Pre-Generated Mocks

Commit generated mocks to version control:

```bash
# Generate once locally
mcpmock build --mcpdesc api.mcpdesc.json --output tests/mocks/

# Commit
git add tests/mocks/
git commit -m "Add pre-generated mocks"
```

**CI workflow**:
```yaml
# No generation needed, use committed mocks
- name: Start mock server
  run: |
    mcpmock run \
      --mcpdesc tests/fixtures/api.mcpdesc.json \
      --data tests/mocks/ \
      --port 3000 &
    sleep 2

- name: Run tests
  run: npm test
```

**Benefits**:
- Faster CI (no generation step)
- Deterministic (same mocks every run)
- No AI dependencies

**Drawbacks**:
- Larger repository
- Manual updates when dump changes

## Using Replay Mode

Record traffic once, replay in CI:

```bash
# Record locally
mcpmock record \
  --mcpdesc api.mcpdesc.json \
  --port 3000 \
  --target http://staging-api:8080 \
  --output traffic.jsonl

# Commit recording
git add traffic.jsonl
git commit -m "Add recorded traffic"
```

**CI workflow**:
```yaml
- name: Replay traffic
  run: |
    mcpmock run \
      --mcpdesc api.mcpdesc.json \
      --replay traffic.jsonl \
      --port 3000 &
    sleep 2

- name: Run tests
  run: npm test
```

## Docker Integration

### Dockerfile

```dockerfile
FROM node:20

# Install mcpmock
RUN npm install -g mcpmock

# Copy test files
WORKDIR /app
COPY api.mcpdesc.json .
COPY mocks/ ./mocks/
COPY package*.json ./
RUN npm install

# Expose port
EXPOSE 3000

# Start mock server and run tests
CMD mcpmock run \
    --mcpdesc api.mcpdesc.json \
    --data mocks/ \
    --transport streamable-http \
    --port 3000 & \
    sleep 2 && \
    npm test
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3'

services:
  mock-api:
    image: node:20
    command: >
      sh -c "npm install -g mcpmock &&
             mcpmock run /app/api.mcpdesc.json 
                         --data /app/mocks/
                         --transport streamable-http
                         --port 3000"
    volumes:
      - ./api.mcpdesc.json:/app/api.mcpdesc.json
      - ./mocks:/app/mocks
    ports:
      - "3000:3000"
  
  tests:
    build: .
    environment:
      - API_URL=http://mock-api:3000/v1/mcp
    depends_on:
      - mock-api
    command: sh -c "sleep 3 && npm test"
```

**Run**:
```bash
docker-compose up --abort-on-container-exit
```

## Multiple Environments

### Staging vs Production Dumps

```yaml
# .github/workflows/test.yml
jobs:
  test-staging:
    steps:
      - run: mcpmock run staging.mcpdesc.json --data mocks-staging/ --port 3000 &
      - run: npm test
  
  test-production:
    steps:
      - run: mcpmock run production.mcpdesc.json --data mocks-prod/ --port 3000 &
      - run: npm test
```

### Matrix Testing

```yaml
strategy:
  matrix:
    api-version: [v1, v2, v3]

steps:
  - name: Test API ${{ matrix.api-version }}
    run: |
      mcpmock run \
        --mcpdesc api-${{ matrix.api-version }}.mcpdesc.json \
        --data mocks-${{ matrix.api-version }}/ \
        --port 3000 &
      sleep 2
      npm test
```

## Advanced Patterns

### Parallel Tests

```yaml
jobs:
  test:
    strategy:
      matrix:
        port: [3000, 3001, 3002, 3003]
    steps:
      - run: |
          mcpmock run \
            --mcpdesc api.mcpdesc.json \
            --data mocks/ \
            --port ${{ matrix.port }} &
          sleep 2
      - run: npm test
        env:
          API_URL: http://localhost:${{ matrix.port }}/v1/mcp
```

### Health Checks

```yaml
- name: Start mock server
  run: |
    mcpmock run api.mcpdesc.json --data mocks/ --port 3000 &
    
- name: Wait for server
  run: |
    timeout 30 sh -c 'until curl -f http://localhost:3000/health; do sleep 1; done'

- name: Run tests
  run: npm test
```

### Caching

```yaml
- name: Cache mocks
  uses: actions/cache@v3
  with:
    path: mocks/
    key: mocks-${{ hashFiles('api.mcpdesc.json') }}

- name: Generate mocks if needed
  run: |
    if [ ! -d "mocks" ]; then
      mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --no-ai
    fi
```

## Troubleshooting

### Server not ready

**Problem**: Tests run before server starts

**Solution**:
```bash
# Add health check
mcpmock run api.mcpdesc.json --port 3000 &
until curl -f http://localhost:3000/health 2>/dev/null; do
  sleep 1
done
npm test
```

### Port conflicts

**Problem**: Port 3000 already in use

**Solution**:
```bash
# Use dynamic port
PORT=$(shuf -i 3000-9000 -n 1)
mcpmock run api.mcpdesc.json --port $PORT &
export API_URL=http://localhost:$PORT/v1/mcp
npm test
```

### Background process not killed

**Problem**: mcpmock keeps running after tests

**Solution**:
```bash
# Capture PID and kill after tests
mcpmock run api.mcpdesc.json --port 3000 &
MOCK_PID=$!

npm test

kill $MOCK_PID
```

## Best Practices

### 1. Use `--no-ai` in CI

AI generation requires external services. Use faker:

```bash
mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --no-ai
```

### 2. Commit Generated Mocks

For faster CI and reproducibility:

```bash
# Generate locally
mcpmock build --mcpdesc api.mcpdesc.json --output tests/mocks/

# Commit
git add tests/mocks/
```

### 3. Use Health Checks

Don't assume server is ready:

```bash
mcpmock run --port 3000 &
until curl -f http://localhost:3000/health; do sleep 1; done
npm test
```

### 4. Clean Up

Always kill background processes:

```bash
mcpmock run --port 3000 &
MOCK_PID=$!
trap "kill $MOCK_PID" EXIT

npm test
```

## Real-World Example

Complete GitHub Actions workflow:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm install -g mcpmock
      
      - name: Cache mocks
        uses: actions/cache@v3
        with:
          path: tests/mocks/
          key: mocks-${{ hashFiles('tests/fixtures/*.mcpdesc.json') }}
      
      - name: Generate mocks
        if: steps.cache.outputs.cache-hit != 'true'
        run: |
          mcpmock build \
            --mcpdesc tests/fixtures/api.mcpdesc.json \
            --output tests/mocks/ \
            --no-ai
      
      - name: Start mock server
        run: |
          mcpmock run \
            --mcpdesc tests/fixtures/api.mcpdesc.json \
            --data tests/mocks/ \
            --transport streamable-http \
            --port 3000 \
            --verbose &
          MOCK_PID=$!
          echo "MOCK_PID=$MOCK_PID" >> $GITHUB_ENV
      
      - name: Wait for server
        run: |
          timeout 30 sh -c 'until curl -f http://localhost:3000/health 2>/dev/null; do sleep 1; done'
      
      - name: Run integration tests
        run: npm test
        env:
          API_URL: http://localhost:3000/v1/mcp
      
      - name: Stop mock server
        if: always()
        run: kill ${{ env.MOCK_PID }}
```

## Next Steps

- 📖 Read [Building Mocks](building-mocks.md) for mock generation
- 📖 Read [HTTP Transport](http-transport.md) for web integration
- 📖 Read [Recording Traffic](recording-traffic.md) for real responses

## Summary

```bash
# CI-friendly workflow
mcpmock build --mcpdesc api.mcpdesc.json --output mocks/ --no-ai
mcpmock run api.mcpdesc.json --data mocks/ --port 3000 &
sleep 2
npm test
```

**Key takeaways**:
- Use `--no-ai` for deterministic, fast generation
- Commit mocks for even faster CI
- Add health checks before running tests
- Always clean up background processes
- Docker Compose for complex setups
