# Code review flow

## What it does
A read-only subagent reviews the code after each phase. It checks correctness, security, performance, maintainability and tests.

## Steps
1. Finish a phase and make sure tests pass.
2. Run the `code-reviewer` agent on the new files.
3. Fix every [CRITICAL] and [MAJOR] finding. Decide on [MINOR] and [NITPICK].
4. Mark the phase done in `roadmap.md`.

## Output
Executive summary, a verdict (APPROVED / CHANGES REQUESTED / NEEDS DISCUSSION), and findings by severity with a suggested fix.

## Files
`.claude/agents/code-reviewer.md`
