---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: Create a git commit with AI-generated message
---
## Context
- Current status: !`git status`
- Staged changes: !`git diff --cached`
- Unstaged changes: !`git diff`
- Untracked files: !`git ls-files --others --exclude-standard`

## Commit Type Convention
| Scenario              | Type     |
| --------------------- | -------- |
| New feature           | feat     |
| Bug fix               | fix      |
| Tests only            | test     |
| Formatting/whitespace | style    |
| Documentation         | docs     |
| Build process         | build    |
| Performance           | perf     |
| Other changes         | refactor or chore |

## Task
1. Stage all changes (including untracked files)
2. Create a single git commit with:
   - If arguments provided: use `$ARGUMENTS` as the commit message
   - Otherwise: generate a message following the format `<type>: <description>`
     - Choose the appropriate type from the convention table above
     - Write a concise description of what changed
