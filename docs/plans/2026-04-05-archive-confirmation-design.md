# Archive Confirmation Design

## Goal

Add a confirmation step before archive actions so archive behavior matches the current delete behavior and reduces accidental irreversible actions.

## Scope

Apply confirmation to these UI entry points only:

- archive button in the main reading panel inbox flow
- archive button in the main reading panel deep-read flow
- `Enter` keyboard shortcut that triggers archive in the main reading panel
- archive button in the learning panel (`已掌握 → 确认归档`)

Do not change:

- delete confirmation copy or behavior
- unarchive behavior
- archive API routes or request payloads
- archive flow in places outside these two components

## Design Decision

Use the same lightweight confirmation pattern already used by delete: `window.confirm(...)`.

Why:

- smallest possible change
- consistent with existing destructive-action UX
- automatically covers both button clicks and keyboard-triggered archive paths when routed through the same handler
- avoids introducing new modal state or timing edge cases

## Behavior

### Reading Panel

Before any archive request is sent:

- show a browser confirmation dialog
- if user cancels, do nothing
- if user confirms, continue existing archive logic unchanged

This applies to:

- normal inbox-mode archive button
- deep-read archive button
- `Enter` shortcut archive path

### Learning Panel

Before `/api/learning/archive` is called:

- show a browser confirmation dialog
- if user cancels, do nothing
- if user confirms, continue existing finish/archive behavior unchanged

## Copy

Use direct, short confirmation copy. Example:

- `确定归档这篇文章？`

For the learning panel, reuse the same copy unless implementation context makes a slightly clearer variant useful.

## Testing Strategy

Add focused component tests that verify:

- reading panel archive button asks for confirmation
- reading panel archive is cancelled when confirm returns `false`
- `Enter` archive path in reading panel also asks for confirmation
- learning panel archive button asks for confirmation
- learning panel archive is cancelled when confirm returns `false`

Verification remains:

- targeted Vitest component tests
- project type check filtered to ignore unrelated `learn-claude-code` files
