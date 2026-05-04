# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # dev server at http://localhost:4200
npm run build      # production build of both library and app
```

## Architecture

Angular 19+ + NgRx SignalStore + PrimeNG `<p-tree>`.
The core logic resides in a dedicated, multi-instance Angular library: `layout-folder-management`.

### Two-source data model

The tree is fed by two separate models passed to the component via Angular `input()`s:

| Source | Shape | Role |
|---|---|---|
| `sessions` | `SessionNode[]` (hierarchical) | Folder structure — source of truth for tree shape |
| `layouts` | `Layout[]` (flat) | File metadata (name, timestamps) — joined to leaves by `id` |

These are kept separate so the hierarchy (`sessions`) and file metadata (`layoutsById`) can be updated independently. The store joins them at projection time via a `computed` signal (`treeNodes`).

### State → UI flow

The library's `FolderTreeComponent` is a "dumb" component that relies on its internal SignalStore.

```
Parent App (Data Fetching)
  │
  ├── [sessions] ───┐
  ├── [layouts]  ───┤
  │                 ▼
  │          Component inputs() -> effect() calls store.initData()
  │                 │
  │                 ▼
  │          NgRx SignalStore (State: sessions, layoutsById, selectedFileId)
  │                 │
  │                 ▼
  │          linkedSignal treeValue (resolves treeNodes, applies filters, maintains expand state, wires parent references)
  │                 │
  │                 ▼
  │          <p-tree [value]="treeValue()">
```

### Multi-Instance capability

- The `FolderTreeStore` is provided at the Component level (`providers: [FolderTreeStore]`), meaning each `<app-folder-tree>` creates its own isolated sandbox.
- The parent application (`app.component.ts`) fetches the data using `FolderApiService` and injects it into multiple instances to demonstrate parallel independence.

### Expanded state preservation

Because PrimeNG mutates the tree in place, the component uses Angular v19's `linkedSignal` to bridge the gap.
When the `treeNodes` store projection changes, `linkedSignal` generates a new array using `deepCopyWithExpanded`, manually recreating the `expanded` boolean values based on the previously expanded keys, and explicitly setting the `parent` object reference so native PrimeNG drops work properly.

### Drag-drop semantics

PrimeNG mutates its internal tree in-place. Because `treeValue` is a `linkedSignal`, we let the native drag-and-drop event loop resolve before applying state changes. We identify the drop location by parsing the mutated tree structure rather than relying on ambiguous drop event properties. Finally, we execute `store.moveNode(...)` wrapped in a short `setTimeout` to decouple the reactive state update from PrimeNG's synchronous event loop, ensuring a smooth UI.

### Key files

- `projects/layout-folder-management/src/lib/models/folder-tree.models.ts` — `SessionNode`, `Layout`, `NodeData` types
- `projects/layout-folder-management/src/lib/store/tree-helpers.ts` — pure functions on `SessionNode[]` using `structuredClone`.
- `projects/layout-folder-management/src/lib/store/folder-tree.store.ts` — Component-scoped NgRx `signalStore`.
- `projects/layout-folder-management/src/lib/components/folder-tree.component.ts` — UI using `linkedSignal`, `input()`, and `output()`.
- `src/app/services/folder-api.service.ts` — Mock backend in the main app providing test data.
