# Folder Management

A reusable Angular 19+ folder-tree widget built on **CDK Virtual Scroll** + **CDK Drag-Drop** (no PrimeNG `<p-tree>`, no `CdkTreeModule`, no store).

**Features:** virtual-scrolled flat-tree rendering · drag-and-drop reordering with custom hit-testing · inline folder rename · file selection · debounced search filtering · "Move to…" picker · custom auto-scroll while dragging · synthetic "Other Users" subtree for orphan layouts.

## Quick start

```bash
npm install
npm start             # http://localhost:4200
npm test              # jsdom unit tests (vitest)
npm run test:watch    # watch mode
npm run test:browser  # real-browser tests (playwright/chromium)
```

The demo app imports the library via a tsconfig `paths` mapping pointing at the lib's **source**, so `ng serve` picks up library changes immediately — no separate `ng build --watch` needed.

## How it works

The library (`layout-folder-management`) is a single standalone component: `<app-folder-tree>`.
Your app fetches data and passes it in — the component handles everything else.

```
App                            <app-folder-tree>
───                            ─────────────────
[sessions]      ◄────► model.required<TreeItem[]>
[layouts]       ─────► input<LayoutInstance[]>
[selectedFileId]◄────► model.required<string | null>
(fileSelected)  ◄───── output<string>   — fires on every file click,
                                          even when the id didn't change

                  flattenSessions(sessions, layouts, expandedIds, filter)
                  ─────────────────────────────────────────────────────
                                ↓
            <cdk-virtual-scroll-viewport *cdkVirtualFor>
```

### Two inputs, one tree

| Input            | Shape                       | Purpose                                            |
| ---------------- | --------------------------- | -------------------------------------------------- |
| `sessions`       | `TreeItem[]`  (hierarchy)   | Folder structure — source of truth for shape       |
| `layouts`        | `LayoutInstance[]` (flat)   | File metadata (name, username, editable, …), joined by `id` |
| `selectedFileId` | `string \| null`            | Two-way bound; auto-expands ancestors on change    |

Keeping `sessions` and `layouts` separate lets you refresh metadata without touching the hierarchy, and persist only the structure on drag-and-drop.

### Why CDK virtual scroll instead of `<p-tree>` or `CdkTreeModule`

- `<p-tree>` keeps the entire visible expanded set in the DOM and uses synchronous in-place mutation for drag-drop.
- `CdkTreeModule` doesn't compose well with virtual scrolling — it renders every visible node.
- For trees the size of the perf seed (250 k nodes), neither works.

Instead we flatten the tree to a `FlatRowData[]` and render only the viewport window. Drag-drop uses pointer-Y + scroll-offset math (`onDragMoved` in `folder-tree.component.ts`) so off-screen rows are still valid drop targets.

### Drag-and-drop

- Cycles prevented via `collectSubtreeIds(sourceId)` — the dragged folder's own subtree is added to a forbidden set at drag start.
- Custom auto-scroll: 60px trigger strip at each edge, speed ramps from 3 → 40 px/frame (`requestAnimationFrame` loop, re-resolves the drop target each tick so the highlight tracks rows scrolling under a stationary pointer).
- "Other Users" subtree is read-only (cannot be a drop target or source).
- Disabled entirely while a search filter is active — use the **Move to…** picker (popover) instead.

### Move-to picker

Each non-Other row exposes a "Move to…" action that opens a `<p-popover>` listing every valid target folder (source's subtree filtered out via `collectSubtreeIds`). The picker works regardless of filter state.

### Selection

Setting `selectedFileId` auto-expands the file's ancestor folders. `fileSelected` fires on every click (including re-clicks of the same id), so consumers can react even when the model value doesn't change.

## Project structure

```
projects/layout-folder-management/src/lib/
├── models/
│   ├── folder-tree.models.ts     # TreeItem, FlatRowData, isFolderNode
│   └── layout-instance.model.ts  # LayoutInstance (6 fields)
├── store/
│   └── tree-helpers.ts           # Pure immutable tree functions
└── components/
    ├── folder-tree.component.ts  # All UI logic — signals + computed
    ├── folder-tree.component.html
    └── folder-tree.component.scss

src/app/
├── app.component.ts              # Demo: "Layouts" button → popover wrapping the tree
├── app.config.ts                 # Zoneless + PrimeNG Aura theme
└── services/folder-api.service.ts# Mock data + 250 k-row perf seed
```

## Testing

Tests use **Vitest** with `@analogjs/vite-plugin-angular` for Angular template compilation.

| Test file                                                 | What it covers                                     | Runner             |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `store/tree-helpers.spec.ts`                              | Pure tree functions                                | vitest + jsdom     |
| `components/folder-tree.component.spec.ts`                | Component logic (select, filter, rename, add, delete, move) | vitest + jsdom     |
| `components/folder-tree.component.browser.spec.ts`        | Real-DOM rendering and user interaction            | vitest browser mode (playwright/chromium) |
