# Archive Confirmation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add browser confirmation before archive actions in the reading panel and learning panel so archive requires the same extra confirmation step as delete.

**Architecture:** Keep all existing archive APIs and payloads unchanged. Add `window.confirm(...)` at the component handlers that already centralize archive behavior, so both button clicks and keyboard-triggered archive paths inherit the same confirmation logic.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest, Testing Library

---

### Task 1: Add confirmation coverage tests

**Files:**
- Create: `src/components/ReadingPanel.test.tsx`
- Create: `src/components/LearningPanel.test.tsx`

- [ ] **Step 1: Write a failing test for reading-panel archive cancel**
- [ ] **Step 2: Run the targeted test and confirm it fails because archive does not ask for confirmation**
- [ ] **Step 3: Write a failing test for reading-panel `Enter` archive confirmation**
- [ ] **Step 4: Write a failing test for learning-panel archive cancel**
- [ ] **Step 5: Run targeted tests and confirm they fail for the expected reason**

### Task 2: Implement archive confirmations

**Files:**
- Modify: `src/components/ReadingPanel.tsx`
- Modify: `src/components/LearningPanel.tsx`

- [ ] **Step 1: Add confirmation to `ReadingPanel.handleArchive()`**
- [ ] **Step 2: Add confirmation to `LearningPanel.handleFinish()`**
- [ ] **Step 3: Keep all existing archive side effects and callbacks unchanged**
- [ ] **Step 4: Re-run targeted tests and confirm they pass**

### Task 3: Verify and commit

**Files:**
- Modify: `src/components/ReadingPanel.test.tsx`
- Modify: `src/components/LearningPanel.test.tsx`
- Modify: `src/components/ReadingPanel.tsx`
- Modify: `src/components/LearningPanel.tsx`

- [ ] **Step 1: Run `npm test -- src/components/ReadingPanel.test.tsx src/components/LearningPanel.test.tsx`**
- [ ] **Step 2: Run `npm test`**
- [ ] **Step 3: Run `npx tsc --noEmit 2>&1 | awk '!/learn-claude-code/ {print; err=1} END {exit err}'`**
- [ ] **Step 4: Commit the change**
