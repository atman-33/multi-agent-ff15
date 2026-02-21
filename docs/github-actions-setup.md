# GitHub Actions CI/CD Setup

This project uses GitHub Actions to automatically run tests on Pull Requests.

## Overview

When you create a Pull Request to the `main` branch, GitHub Actions will automatically:

1. Run Busy Detection tests
2. Run Integration tests
3. Report test results

## Required Tests (Must Pass)

- **Busy Detection**: busy_detect.sh, inbox-watcher plugin validation
- **Integration**: messaging system integration tests

## Optional Tests (Informational)

- Inbox overflow handling
- Flock stress tests
- Concurrent inbox tests

## Branch Protection Setup

To enforce that PRs can only be merged when tests pass:

1. Go to **Settings** → **Branches** in your GitHub repository
2. Under **Branch protection rules**, click **Add rule**
3. Branch name pattern: `main`
4. Check **Require a pull request before merging**
5. Check **Require status checks to pass before merging**
6. Search for and select `Test Suite` (or individual test names like `test`)
7. Check **Require branches to be up to date before merging** (recommended)
8. Save changes

## Workflow File

The workflow is defined in `.github/workflows/test.yml`:

```yaml
name: Test Suite
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - run: pip install pyyaml
    - run: chmod +x scripts/*.sh tests/*.sh
    - run: ./tests/test_busy_detection.sh
    - run: ./tests/test_integration.sh
```

## Running Tests Locally

Before pushing, you can run tests locally:

```bash
# Make scripts executable
chmod +x tests/*.sh

# Run all tests
./tests/test_busy_detection.sh
./tests/test_integration.sh
```

## Test Results

Test results appear in the PR checks section. Click "Details" to see full output.
