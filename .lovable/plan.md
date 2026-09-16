# Mobile-first study app

## Goal
Build a functional study workspace where signed-in users turn pasted text, notes, or PDFs into structured explanations and flashcards, organize them as Course → Chapter → Topic, review progress, and reopen downloaded topics without a connection.

## User experience
- Make `/` a session-aware entry point: signed-out users see email/password and Google sign-in; signed-in users enter the study workspace.
- Build the workspace mobile-first for 375–430px screens:
  - compact top bar with a 44px menu control
  - folder tree in a full-height mobile drawer; persistent sidebar only on wider screens
  - one-column, independently scrollable content views with no horizontal overflow
  - bottom or sticky primary actions where useful, all touch targets at least 44px
- Add four focused views inside the workspace:
  1. **New material** — paste text/notes or select `.txt`, `.md`, or `.pdf`; show extraction and generation states without losing input on failure.
  2. **Topic** — structured concept list; each concept shows its plain-language explanation, analogy/example, and recall question. “Explain differently” and “Another example” update only that concept.
  3. **Review** — flip-through flashcards with Again / Hard / Good controls and due-card counts.
  4. **Progress** — concepts studied, recall accuracy, cards due, and recent topics.
- Add save destination selection with existing Course/Chapter choices and inline creation.
- Add tree actions for expand/collapse, rename, move topic, and reorder. On phones, use explicit move/reorder controls rather than fragile drag-only interaction.
- Preserve repeated generations as numbered topic versions rather than overwriting history.
- Clearly label offline status and cached topics. Offline topics remain readable, while AI generation, organization edits, and sync wait for connectivity.

## Data and security
Use Lovable Cloud with no profile table. Identity comes directly from the account system.

Create private, owner-scoped tables:
- `courses`: name and sort position
- `chapters`: course, name, and sort position
- `topics`: chapter, title, source type/name/text, version family/number, full static generated payload, sort position, and cache timestamp/version
- `concept_progress`: topic concept key, studied state, recall attempts, and correct count
- `flashcard_reviews`: topic flashcard key, repetitions, interval/ease, last result, and next review date

Every table will include explicit authenticated/service grants, row-level rules restricting all operations to its owner, timestamps, update triggers, hierarchy validation, and ordering indexes. Deleting a course or chapter cascades only through that user’s descendants.

## AI generation
- Add protected server functions for lesson generation and single-concept regeneration; prompts and credentials stay server-side.
- Extract PDF text locally before sending it; reject encrypted/empty PDFs with a clear message and retain the selected file state.
- Ask Lovable AI for a strict structure containing:
  - individual concepts/sub-topics
  - one simple explanation, one analogy/example, and one recall question per concept
  - 3–5 flashcards for the material
- Use the default reasoning model through the streaming Responses API, consume the stream server-side, validate the final structured result, and surface provider errors and retry guidance.
- For “explain differently” or “another example,” send only the selected concept plus minimal lesson context, then merge and persist that concept without regenerating the lesson or flashcards.
- Create the topic row only after a valid AI result. Re-running the same source creates a new version linked to the same version family.

## Offline and sync behavior
- Store each opened/saved topic’s complete static payload in IndexedDB, keyed by user and topic version.
- Cache the app shell so previously downloaded topics can open without a network connection.
- Prefer fresh cloud data online, update the local cache after successful reads/writes, and fall back to cached topic content when offline.
- Keep offline mode read-only as requested: no queued AI calls or edits. Progress and organization changes require a connection, avoiding silent conflicts.
- Clear in-memory account data on sign-out while retaining encrypted-origin browser cache separation by user ID; never expose one account’s cached topics to another session.

## Authentication
- Enable email/password and managed Google sign-in.
- Include sign up, sign in, sign out, email confirmation state, forgot password, and a public reset-password page.
- Put the workspace behind the managed authenticated route boundary and protect every private server function independently.

## Implementation sequence
1. Configure authentication and apply the database migration.
2. Add the AI provider helper, structured generation functions, PDF extraction, and a real gateway smoke test.
3. Add the local topic cache and connectivity handling.
4. Build authentication screens and the protected mobile workspace shell.
5. Build material generation, topic save/versioning, concept regeneration, folder tree management, flashcard review, and progress screens.
6. Verify sign-up/sign-in, generation, selective regeneration, save/move/reorder, review scheduling, sign-out isolation, narrow-screen scrolling, and offline reopening with browser tests.
7. Run the database security linter and verify unique metadata for each content route.

## Acceptance checks
- A 390px viewport has no horizontal overflow; the tree and each screen scroll independently and all actions are touch-friendly.
- A text file, Markdown file, pasted note, and text-based PDF each produce structured concepts and 3–5 flashcards.
- Regenerating one concept leaves every other concept and flashcard unchanged.
- Saving to a newly created Course/Chapter works in one flow; moving and reordering persist after refresh.
- Repeating a generation creates a visible new topic version and preserves the old version.
- A previously opened topic remains fully readable after network access is removed and causes no AI request.
- User-owned records cannot be read or changed by another account.
