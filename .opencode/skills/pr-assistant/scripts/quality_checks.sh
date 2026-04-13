#!/bin/bash
# Quality checks before creating a PR
# Returns JSON with check results

set -euo pipefail

TARGET_BRANCH="${1:-main}"
RESULTS=()

add_check() {
    local name="$1"
    local status="$2"
    local message="$3"
    RESULTS+=("${name}"$'\t'"${status}"$'\t'"${message}")
}

# Check 1: Uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    add_check "uncommitted_changes" "warn" "There are uncommitted changes in the working directory"
else
    add_check "uncommitted_changes" "pass" "No uncommitted changes"
fi

# Check 2: Merge conflicts
if git merge-tree "$(git merge-base HEAD "$TARGET_BRANCH")" "$TARGET_BRANCH" HEAD | grep -q "^<<<<<"; then
    add_check "merge_conflicts" "fail" "Merge conflicts detected with $TARGET_BRANCH"
else
    add_check "merge_conflicts" "pass" "No merge conflicts"
fi

# Check 3: Branch is ahead of target
AHEAD=$(git rev-list --count "$TARGET_BRANCH..HEAD" 2>/dev/null || echo "0")
if [[ "$AHEAD" -eq 0 ]]; then
    add_check "branch_ahead" "fail" "Current branch has no commits ahead of $TARGET_BRANCH"
else
    add_check "branch_ahead" "pass" "Branch is $AHEAD commit(s) ahead of $TARGET_BRANCH"
fi

# Check 4: TODO/FIXME in changed files
TODO_COUNT=0
while IFS= read -r file; do
    if [[ -f "$file" ]]; then
        count=$(grep -c -E '(TODO|FIXME)' "$file" 2>/dev/null || true)
        if [[ -n "$count" ]]; then
            TODO_COUNT=$((TODO_COUNT + count))
        fi
    fi
done < <(git diff --name-only "$TARGET_BRANCH...HEAD" | grep -E '\.(py|js|ts|tsx|jsx|vue)$' || true)

if [[ "$TODO_COUNT" -gt 0 ]]; then
    add_check "todo_comments" "warn" "Found $TODO_COUNT TODO/FIXME comment(s) in changed files"
else
    add_check "todo_comments" "pass" "No TODO/FIXME comments in changed files"
fi

# Check 5: Large files (>1MB)
LARGE_FILES=()
while IFS= read -r file; do
    if [[ -f "$file" ]]; then
        size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
        if [[ "$size" -gt 1048576 ]]; then
            human_size=$(numfmt --to=iec-i --suffix=B "$size" 2>/dev/null || echo "${size}B")
            LARGE_FILES+=("$file ($human_size)")
        fi
    fi
done < <(git diff --name-only "$TARGET_BRANCH...HEAD")

if [[ ${#LARGE_FILES[@]} -gt 0 ]]; then
    add_check "large_files" "warn" "Large files detected: $(printf '%s, ' "${LARGE_FILES[@]}" | sed 's/, $//')"
else
    add_check "large_files" "pass" "No large files"
fi

# Check 6: Test files for code changes
HAS_CODE_CHANGES=false
HAS_TEST_CHANGES=false
while IFS= read -r file; do
    if [[ "$file" =~ \.(py|js|ts|tsx|jsx|vue)$ ]]; then
        if [[ "$file" =~ (test|spec|__tests__|\.test\.|\.spec\.) ]]; then
            HAS_TEST_CHANGES=true
        else
            HAS_CODE_CHANGES=true
        fi
    fi
done < <(git diff --name-only "$TARGET_BRANCH...HEAD")

if [[ "$HAS_CODE_CHANGES" == true && "$HAS_TEST_CHANGES" == false ]]; then
    add_check "test_coverage" "warn" "Code changes detected but no test file changes"
elif [[ "$HAS_CODE_CHANGES" == true && "$HAS_TEST_CHANGES" == true ]]; then
    add_check "test_coverage" "pass" "Test files updated with code changes"
else
    add_check "test_coverage" "pass" "No code changes requiring tests"
fi

# Check 7: Dependencies changed
if git diff --name-only "$TARGET_BRANCH...HEAD" | grep -qE '(requirements\.txt|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)'; then
    add_check "dependencies" "warn" "Dependency files changed - ensure they are properly reviewed"
else
    add_check "dependencies" "pass" "No dependency changes"
fi

printf '%s\n' "${RESULTS[@]}" | python3 -c '
import json
import sys

checks = []
for raw_line in sys.stdin.read().splitlines():
    if not raw_line:
        continue
    name, status, message = raw_line.split("\t", 2)
    checks.append({"name": name, "status": status, "message": message})

payload = {
    "checks": checks,
    "summary": {
        "failures": sum(1 for check in checks if check["status"] == "fail"),
        "warnings": sum(1 for check in checks if check["status"] == "warn"),
    },
}

print(json.dumps(payload, indent=2))
'
