Replace every placeholder and localize the final file to the target facet language.

# <Instruction Title>

1. Read <required inputs, prior outputs, or references> before starting.
2. Perform <the main step procedure>.
3. Use supported dynamic placeholders only when the runtime contract guarantees them. `{{ output("<step-name>", "latest", "<artifact-name>") }}` is for prior workflow artifacts, and `{{ setting("language", "name") }}` is for configured language wording.
4. If blocked, report the blocker, the missing dependency, and the recommended next action.
5. Stop when <completion condition> is satisfied.