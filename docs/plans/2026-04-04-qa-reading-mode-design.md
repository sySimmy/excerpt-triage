# QA Reading Mode Design

## Goal

Improve the readability of the learning Q&A tab by replacing the current chat-style transcript with a focused reading experience: one active answer displayed as an article, with historical questions available as a compact navigational list.

## Current State

The current Q&A UI in `src/components/QAView.tsx` renders every question and answer as a continuous chat log:

- the active answer competes with the full message history for space
- long NotebookLM answers are rendered as plain text inside a small bubble
- answers use secondary text color on a dark card, which lowers contrast
- the layout encourages scrolling through transcript history instead of reading the current answer well
- loading and error states are also embedded as chat bubbles, which makes system status visually noisy

This works for short back-and-forth messages, but the actual usage pattern is mixed:

- some answers are short follow-up clarifications
- some answers are long summary-style explanations with lists and structure

The current chat presentation handles neither case especially well.

## Product Decision

Adopt a hybrid "Q&A reading mode" instead of a pure chat UI.

Key principle:

- questions remain lightweight and conversational
- answers are treated as reading artifacts

This keeps follow-up behavior intact while making long-form answers readable.

## Information Architecture

The Q&A tab becomes a three-part layout:

1. `History rail`
   Shows past questions as a navigational list.
2. `Focused answer view`
   Shows the currently selected question and its answer in a reader-style panel.
3. `Composer`
   Supports entering a new follow-up question without taking over the page.

### Desktop

Two-column layout:

- left rail: compact history list
- right content pane: current question + answer reader

### Mobile

Single-column layout:

- top horizontal history strip or stacked compact history block
- current question and answer below
- composer anchored at the bottom

## Interaction Model

### Default Focus

When the Q&A tab opens:

- if history exists, focus the latest question
- if there is no history, show an empty state with example prompts

### History Behavior

History entries show:

- question summary, truncated to one line
- timestamp or relative freshness hint

History entries do not show full answers.

Selecting a history item:

- switches the focused answer on the right
- scrolls the answer pane to top
- does not disturb the history list scroll position

### New Question Flow

When the user sends a new question:

- create a temporary active history item immediately
- move focus to that new item
- show a reader-style loading skeleton in the answer pane
- replace the skeleton with the final answer when the request completes

This keeps the page stable and avoids appending another large block to a transcript.

### Loading and Error States

Loading state should appear in the focused answer pane, not as a fake assistant message.

Error state should render as a reader-side status card with:

- short error title
- recovery text
- optional retry affordance later if desired

## Visual Direction

Use a dark reading-surface aesthetic that matches the existing learning panel while increasing contrast and hierarchy.

### History Rail

Purpose:

- navigation, not reading

Characteristics:

- width around `220px` to `260px` on desktop
- darker background than the reader pane
- active item uses a clear background change and a thin accent bar
- inactive items stay low-noise but must still be scannable

### Focused Question Bar

Displayed above the answer content.

Characteristics:

- compact, fixed header inside the answer pane
- question shown as a short title, not as a large bright bubble
- metadata line below or alongside if useful

### Answer Reader

Purpose:

- make long answers comfortable to read

Characteristics:

- centered content column
- max width around `68ch` to `72ch`
- body text near primary foreground, not muted secondary text
- body size `15px` to `16px`
- line height `1.75` to `1.85`
- generous paragraph spacing
- stable padding so the content reads like an article, not a message

## Content Rendering

Answers should render as Markdown, not plain text.

Implementation direction:

- reuse `ReactMarkdown` and `remarkGfm`, already present in `LearningPanel.tsx`
- preserve paragraph breaks, lists, emphasis, links, blockquotes, and code blocks

### Markdown Styling Rules

- `p`: clear paragraph rhythm
- `ul` / `ol`: deeper indentation and slightly larger spacing between items
- `blockquote`: left border plus subtle background treatment
- `strong`: stronger weight only, no extra color noise
- `a`: accent color with clearer hover state
- `code` / `pre`: isolated surface so structured content does not blend into body text

If the NotebookLM response is not well-formed Markdown, the renderer should still benefit from preserved line breaks and paragraph separation.

## Empty State

Do not show only a single sentence.

Instead show:

- short explanation of what this tool does
- two or three example questions
- reassurance that follow-up questions build on the article context

This makes the view feel intentional instead of unfinished.

## Accessibility and Usability Constraints

- maintain keyboard submit: `Enter` sends, `Shift+Enter` inserts newline
- ensure answer and history panes have independent scrolling
- keep contrast high enough for long reading sessions
- avoid tiny timestamps or over-muted metadata
- keep active-state cues visible without relying only on color

## State Model Changes

The current message array structure is usable but the view logic should become focus-driven.

Recommended UI state additions:

- `selectedIndex` or `selectedMessageId`
- `pendingQuestion` item while a response is in flight

Messages can continue to be stored as question-answer pairs. The main change is presentation:

- one selected pair is rendered in full
- the rest are rendered as navigation items

## Component Direction

`src/components/QAView.tsx` should be refactored into smaller internal sections:

- `QAHistoryList`
- `QAFocusedQuestion`
- `QAFocusedAnswer`
- `QAComposer`

This can still remain in one file initially if desired, but the structure should reflect the layout split.

`src/components/LearningPanel.tsx` likely needs little or no structural change beyond ensuring the Q&A tab can host the full-height split view cleanly.

## Non-Goals

- redesigning the learning panel outside the Q&A tab
- changing the API contract of `/api/learning/ask`
- adding rich citation chips or source highlighting in this pass
- introducing multi-threaded conversations

## Rollout Recommendation

Implement in two passes:

1. Layout and readability pass
   Add focused reader layout, history rail, Markdown rendering, loading and empty states.
2. Polish pass
   Tighten spacing, responsive behavior, hover states, and optional retry affordances.

This keeps the first iteration focused on the real problem: answer readability.
