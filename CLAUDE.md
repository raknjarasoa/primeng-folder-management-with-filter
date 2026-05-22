# CLAUDE.md

Context for Claude Code (and other AI assistants) working in this repository.

## Commands

```bash
npm start            # dev server at http://localhost:4200 (consumes lib via source-path mapping)
npm run build        # production build (library + app)
npm test             # run jsdom unit tests (vitest)
npm run test:watch   # watch mode
# npm run test:browser # run real-browser integration tests (vitest + playwright/chromium)
npm run test:ui      # vitest UI
```

The app imports the library through a TypeScript `paths` mapping pointing at the lib's **source** (not `dist/`), so changes inside `projects/layout-folder-management` are picked up by `ng serve` without a manual lib rebuild.

## Architecture

Angular 19+ · zoneless · OnPush · standalone components · PrimeNG (no `<p-tree>`) · CDK virtual scroll + CDK drag-drop.

The library is `layout-folder-management`. It exports one component (`FolderTreeComponent`) and three types (`TreeItem`, `LayoutInstance`, `FlatRowData`).

There is **no store**. State lives directly in the component as signals — the previous NgRx SignalStore was removed once it became a thin wrapper over pure helpers.

### Data flow

```
Parent inputs           Component internals
──────────────          ──────────────────────────────────
[sessions]   ◄►  model.required<TreeItem[]>
[layouts]    ──►  input<LayoutInstance[]>
[selectedFileId] ◄►  model.required<string | null>
(fileSelected) ◄──  output<string>  — fires on every file-row click,
                                       including re-clicks of the same id

           sessions, layouts
                  ↓
   flattenSessions() — pure, walks the expanded subtree
                  ↓
        flatRows: FlatRowData[]  (computed signal)
                  ↓
   <cdk-virtual-scroll-viewport *cdkVirtualFor>
```

### Key design decisions

- **Flat-list rendering on top of CDK virtual scroll.** `CdkTreeModule` doesn't pair well with virtual scrolling — every visible node ends up in the DOM. With the perf seed (100 folders × 2500 files = 250 k nodes) that's a non-starter. We flatten the tree into a single `FlatRowData[]` and render only the visible window.
- **Custom drag hit-testing.** CDK drag-drop's built-in `cdkDropList` hit testing only sees rows currently in the DOM. `onDragMoved` resolves the target from pointer Y + viewport scroll offset, independent of DOM presence.
- **Immutable tree updates via structural sharing** (no `structuredClone`). `tree-helpers.ts` returns new arrays/folders only along the changed path.
- **Standard `signal` for `suppressedLayoutIds`.** When the user deletes a row, the layout is hidden locally. Since the component is destroyed and remounted on popover toggle, this naturally resets on open.
- **`ResizeObserver` inside the component.** Covers the hidden→visible transition when the tree lives inside a `<p-popover>` (CDK's own resize tracking can miss `display:none → block`). Initial measurement runs once via `afterNextRender`.
- **Custom auto-scroll while dragging.** 60px trigger zone, speed ramps linearly from 3 → 40 px/frame as the pointer approaches the edge; the rAF loop also re-resolves the drop target each frame so the highlight tracks rows scrolling beneath a stationary pointer.
- **"Other Users" synthetic subtree.** Orphan layouts (in `layouts` but not in `sessions`) are grouped under a synthetic `"Other Users"` folder at depth 0, then per-username folders at depth 1. The synthetic ids (`others-root`, `others-<username>`) must stay in sync between `flattenSessions` and `selectedFileAncestors`.
- **Move-to picker.** A `<p-popover>` driven by `moveCandidates` (computed `FolderOption[]`) is the safe alternative to drag-drop while filtering is active — drag is gated by `!isFiltering()` because the flat-row depth scan in `resolveDropTarget` breaks when ancestors are hidden.

### Key files

| File | Purpose |
|------|---------|
| `lib/models/folder-tree.models.ts` | `TreeItem` (= `FolderNode \| FileNode`), `FlatRowData`, `isFolderNode` |
| `lib/models/layout-instance.model.ts` | `LayoutInstance` (id, name, editable, username, description, tooltip) |
| `lib/store/tree-helpers.ts` | Pure tree functions (`findLocation`, `insertNode`, `removeNode`, `renameFolder`, `addFolder`, `collectAncestorIds`, `collectSubtreeIds`, `isAncestorOrSelf`, `flattenSessions`, `flattenFolders`) |
| `lib/components/folder-tree.component.ts` | All UI logic: signals, computed state, drag-drop, auto-scroll, move picker, viewport refresh |
| `lib/components/folder-tree.component.html` | Template — toolbar + `cdk-virtual-scroll-viewport` + Move-to popover |
| `lib/components/folder-tree.component.scss` | Row layout, drag preview, picker, drop-line styles |
| `src/app/services/folder-api.service.ts` | Mock data for the demo app (includes the 250 k-row perf seed) |

### Tests

| File | What it covers | Runner |
|------|----------------|--------|
| `lib/store/tree-helpers.spec.ts` | Pure-function units (find/insert/remove/rename/add/ancestors/subtree/flatten) | vitest + jsdom |
| `lib/components/folder-tree.component.spec.ts` | Component logic — selection auto-expand, filter, rename, add, delete, move | vitest + jsdom |
| `lib/components/folder-tree.component.browser.spec.ts` | Real-DOM rendering & user input via Playwright | vitest browser mode |
