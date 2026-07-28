# Test Coverage Configuration

## 📊 Overview

This document explains the test coverage configuration for the NestJS template, including how coverage reports are generated and integrated with CI/CD workflows.

## 🔧 Configuration

### Jest Coverage Reporters

The project is configured to generate multiple coverage report formats:

- **`json-summary`**: JSON summary file used by CI/CD workflows
- **`text`**: Console output during test runs
- **`lcov`**: Coverage data for IDEs and tools
- **`html`**: Human-readable HTML reports

### Configuration Files

#### 1. **Unit Tests** (`package.json`)

```json
{
  "jest": {
    "coverageDirectory": "../coverage",
    "coverageReporters": [
      "json-summary",
      "text",
      "lcov",
      "html"
    ]
  }
}
```

**Command**: `npm run test:cov`

#### 2. **Integration Tests** (`jest.integration.config.js`)

```javascript
module.exports = {
  coverageDirectory: './coverage/integration',
  coverageReporters: ['json-summary', 'text', 'lcov', 'html'],
  // ... other config
};
```

**Command**: `npm run test:integration:cov`

#### 3. **E2E Tests** (`test/jest-e2e.json`)

```json
{
  "coverageDirectory": "../coverage",
  "coverageReporters": [
    "json-summary",
    "text",
    "lcov",
    "html"
  ]
}
```

**Command**: `npm run test:e2e -- --coverage`

---

## 📁 Generated Files

After running tests with coverage, the following files are generated:

```
coverage/
├── coverage-summary.json    # ✅ Required by CI/CD
├── coverage-final.json
├── lcov.info
└── lcov-report/
    └── index.html          # HTML report
```

### Important File: `coverage-summary.json`

This file contains coverage percentages and is **required by the PR validation workflow**:

```json
{
  "total": {
    "lines": {
      "total": 342,
      "covered": 224,
      "pct": 65.49
    },
    "statements": {
      "total": 391,
      "covered": 253,
      "pct": 64.7
    },
    "functions": {
      "total": 68,
      "covered": 50,
      "pct": 73.52
    },
    "branches": {
      "total": 162,
      "covered": 93,
      "pct": 57.4
    }
  }
}
```

---

## 🤖 CI/CD Integration

### PR Validation Workflow

The `.github/workflows/pr-validation.yml` workflow:

1. **Runs tests with coverage**:
   ```yaml
   - name: 🧪 Run unit tests with coverage
     run: npm run test:cov
   ```

2. **Parses coverage data**:
   ```yaml
   - name: 📊 Generate coverage report
     run: |
       if [ -f coverage/coverage-summary.json ]; then
         STATEMENTS=$(jq '.total.statements.pct' coverage/coverage-summary.json)
         BRANCHES=$(jq '.total.branches.pct' coverage/coverage-summary.json)
         # ... extract other metrics
       fi
   ```

3. **Uploads coverage artifacts**:
   ```yaml
   - name: 📈 Upload coverage to artifacts
     uses: actions/upload-artifact@v4
     with:
       name: coverage-report
       path: coverage/
   ```

4. **Comments on PR** with coverage summary:
   ```
   📊 Test Coverage
   | Metric | Coverage |
   |--------|----------|
   | 🟢 Statements | 64.7% |
   | 🟡 Branches | 57.4% |
   | 🟢 Functions | 73.52% |
   | 🟢 Lines | 65.49% |
   ```

---

## 🐛 Common Issues

### ⚠️ "Coverage summary not found"

**Problem**: The workflow cannot find `coverage/coverage-summary.json`

**Cause**: Missing `json-summary` reporter in Jest configuration

**Solution**: Ensure `coverageReporters` includes `"json-summary"`:

```json
{
  "coverageReporters": ["json-summary", "text", "lcov", "html"]
}
```

### ⚠️ Coverage artifacts not uploaded

**Problem**: Coverage files are not available in workflow artifacts

**Cause**: Tests might be failing or coverage directory path is incorrect

**Solution**: 
1. Check test execution logs
2. Verify `coverageDirectory` setting matches artifact path
3. Ensure `continue-on-error: true` is set if tests can fail

---

## 📊 Coverage Thresholds

### Recommended Thresholds

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Lines | 60% | 80% | 90%+ |
| Statements | 60% | 80% | 90%+ |
| Functions | 70% | 85% | 95%+ |
| Branches | 50% | 70% | 85%+ |

### Setting Thresholds

To enforce minimum coverage thresholds, add to Jest config:

```json
{
  "coverageThreshold": {
    "global": {
      "branches": 50,
      "functions": 70,
      "lines": 60,
      "statements": 60
    }
  }
}
```

**Warning**: This will fail the test run if coverage drops below thresholds.

---

## 🧪 Running Coverage Locally

### Quick Commands

```bash
# Unit tests with coverage
npm run test:cov

# Integration tests with coverage
npm run test:integration:cov

# E2E tests with coverage
npm run test:e2e -- --coverage

# Open HTML report
open coverage/lcov-report/index.html
```

### Viewing Coverage Report

1. Run tests with coverage
2. Open `coverage/lcov-report/index.html` in browser
3. Navigate through files to see line-by-line coverage

---

## 🔍 Coverage Best Practices

### 1. **Focus on Critical Paths**
- Prioritize business logic
- Cover error handling
- Test edge cases

### 2. **Exclude Non-Critical Files**
```javascript
collectCoverageFrom: [
  'src/**/*.(t|j)s',
  '!src/**/*.spec.ts',      // Exclude test files
  '!src/**/*.module.ts',    // Exclude module files
  '!src/main.ts',           // Exclude entry point
]
```

### 3. **Review Coverage Regularly**
- Monitor coverage trends in PRs
- Identify untested code paths
- Refactor to improve testability

### 4. **Don't Chase 100%**
- Focus on meaningful tests
- Some code doesn't need testing (DTOs, interfaces)
- Quality > Quantity

---

## 📚 Related Documentation

- [Testing Guide](./TESTING.md)
- [Integration Tests](../test/integration/README.md)
- [PR Validation Workflow](../.github/workflows/pr-validation.yml)
- [Jest Documentation](https://jestjs.io/docs/configuration#coveragereporters-arraystring--string-options)

---

## 🔄 Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-10 | 1.0.0 | Initial documentation with coverage fix |

---

**Maintainer**: GOINFO TEAM DevOps  
**Last Updated**: 2025-10-10
