#!/bin/bash

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Check for broken markdown links in docs/ folder
# Run from project root: ./tests/check-doc-links.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=================================="
echo "Documentation Link Checker"
echo "=================================="
echo ""

errors=0

check() {
  if [ ! -e "$1" ]; then
    echo "❌ BROKEN: $1${2:+ ($2)}"
    errors=$((errors+1))
  fi
}

# User-facing docs
echo "Checking user-facing docs..."
check "docs/GETTING_STARTED.md"
check "docs/authoring-replay-datasets.md"
check "docs/building-mocks.md"
check "docs/ci-cd-testing.md"
check "docs/http-transport.md"
check "docs/manual-mocks.md"
check "docs/mcptest-integration.md"
check "docs/recording-traffic.md"
check "docs/vscode-extension.md"

# Maintainer docs
echo "Checking maintainer docs..."
check "docs/maintainers/mcpmock-design.md"
check "docs/maintainers/multi-version-schema-support.md"
check "docs/maintainers/vscode-integration.md"

# Examples
echo "Checking examples..."
check "examples/weather/get-current.json"
check "examples/weather/get-forecast.json"

# Root-level docs
echo "Checking project root docs..."
check "README.md"
check "CHANGELOG.md"
check "CONTRIBUTING.md"
check "CODE_OF_CONDUCT.md"
check "SECURITY.md"
check "MAINTAINERS.md"
check "SUPPORT.md"
check "LICENSE"
check "AGENTS.md"

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All documentation links are valid!"
  exit 0
else
  echo "❌ Found $errors broken link(s)"
  echo ""
  echo "Fix broken links before releasing."
  exit 1
fi
