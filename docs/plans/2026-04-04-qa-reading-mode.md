# QA Reading Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the learning Q&A tab's transcript-style UI with a focused reading layout that highlights one answer at a time and moves prior questions into a compact history list.

**Architecture:** Keep the existing `/api/learning/ask` request shape and cached Q&A data model, but refactor `QAView` from a linear chat log into a focus-driven layout. One selected question-answer pair is rendered in a Markdown reader, while the remaining pairs become navigational history items. The Learning tab shell stays mostly unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, Tailwind CSS 4, `react-markdown`, `remark-gfm`

**Spec:** `docs/plans/2026-04-04-qa-reading-mode-design.md`

---

### Task 1: Reshape the Q&A view state around a focused item

**Files:**
- Modify: `src/components/QAView.tsx`

- [ ] **Step 1: Add focused-selection state**

Add UI state for the currently selected history item:

```ts
const [selectedIndex, setSelectedIndex] = useState(
  initialMessages.length > 0 ? initialMessages.length - 1 : -1
);
```

Also update selection whenever `initialMessages` change or a new local message is appended.

- [ ] **Step 2: Add a pending question placeholder state**

Track a temporary in-flight item so the UI can focus a new question before the answer returns:

```ts
const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
```

- [ ] **Step 3: Update send flow to focus the in-flight item**

Before the `fetch("/api/learning/ask")` call:

- trim and store the question
- clear the textarea
- set `pendingQuestion`
- set the focused item to the pending state

After success or failure:

- append the final message pair
- clear `pendingQuestion`
- move focus to the newly appended item

- [ ] **Step 4: Remove transcript auto-scroll behavior**

Delete the current bottom-anchor auto-scroll pattern:

```ts
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, thinking]);
```

The new layout should not behave like a streaming chat transcript.

- [ ] **Step 5: Run type check for the modified file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
```

Expected:

- no errors from `src/components/QAView.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/QAView.tsx
git commit -m "Refactor QA state for focused reading mode"
```

---

### Task 2: Replace the transcript layout with history + focused answer

**Files:**
- Modify: `src/components/QAView.tsx`

- [ ] **Step 1: Build the desktop and mobile layout shell**

Replace the current single-column transcript wrapper with:

- desktop: `md:grid md:grid-cols-[240px_minmax(0,1fr)]`
- mobile: stacked layout

Use one section for history and one for the focused reader.

- [ ] **Step 2: Add the history list**

Render all completed messages as compact buttons showing:

- truncated question text
- compact timestamp

Each item should:

- call `setSelectedIndex(index)` on click
- show active styling when selected
- use a subdued visual style when inactive

- [ ] **Step 3: Add the focused question bar**

At the top of the reader pane, render the selected question in a compact header block instead of a large chat bubble.

For the pending state, render the pending question there immediately.

- [ ] **Step 4: Add the focused answer area**

Render only one answer at a time:

- selected completed answer if one exists
- loading skeleton if `pendingQuestion` is active
- empty state if no messages exist

- [ ] **Step 5: Keep the composer anchored separately**

Move the textarea and send button into a dedicated footer bar below the split view so it no longer competes visually with the reader pane.

- [ ] **Step 6: Run type check for the modified file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
```

Expected:

- no errors from `src/components/QAView.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/QAView.tsx
git commit -m "Add focused history layout to QA view"
```

---

### Task 3: Render answers as readable Markdown articles

**Files:**
- Modify: `src/components/QAView.tsx`
- Reference: `src/components/LearningPanel.tsx`

- [ ] **Step 1: Import Markdown renderer dependencies**

Add:

```ts
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

Reuse the same rendering stack already used by `LearningPanel.tsx`.

- [ ] **Step 2: Replace plain-text answer rendering with Markdown**

Render the focused answer through:

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {answer}
</ReactMarkdown>
```

- [ ] **Step 3: Add Markdown component styling hooks**

Style rendered content for:

- paragraphs
- headings if present
- ordered and unordered lists
- blockquotes
- inline code and code blocks
- links

Keep styles aligned with the dark learning panel aesthetic.

- [ ] **Step 4: Constrain reading width and improve typography**

Apply layout and text classes that enforce:

- readable measure around `68ch` to `72ch`
- stronger foreground color
- `text-sm` or custom `15px` equivalent
- `leading-7` or `leading-8`
- clearer spacing between blocks

- [ ] **Step 5: Convert loading and error states into reader cards**

Remove chat-bubble status messages. Replace them with:

- skeleton lines or pulsing blocks during loading
- compact error card on failure

- [ ] **Step 6: Run type check for the modified file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
```

Expected:

- no errors from `src/components/QAView.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/QAView.tsx
git commit -m "Render QA answers as Markdown reader content"
```

---

### Task 4: Add polish for empty, active, and responsive states

**Files:**
- Modify: `src/components/QAView.tsx`

- [ ] **Step 1: Improve the empty state**

Replace the current single-line prompt with:

- short description
- 2 to 3 example questions

- [ ] **Step 2: Improve active and hover states in the history rail**

Ensure the selected history item has:

- stronger background
- accent marker
- non-color cue such as weight or border

Ensure inactive items remain legible and have a clear hover response.

- [ ] **Step 3: Tighten mobile behavior**

On small screens:

- stack the history above the reader or make it horizontally scrollable
- keep the composer accessible without crushing the answer width

- [ ] **Step 4: Manually verify the Q&A tab behavior**

Run the dev server if needed and verify:

- latest question is focused on load
- clicking history switches the reader content
- submitting a question creates a pending focused item
- long answers are readable
- mobile layout does not collapse awkwardly

- [ ] **Step 5: Run type check for the modified file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
```

Expected:

- no errors from `src/components/QAView.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/QAView.tsx
git commit -m "Polish QA reading mode states and responsiveness"
```
