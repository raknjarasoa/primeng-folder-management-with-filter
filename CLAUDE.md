# CLAUDE.md

Context for Claude Code (and other AI assistants) working in this repository.

## Commands

```bash
npm start       # dev server at http://localhost:4200
npm run build   # production build (library + app)
```

## Architecture

Angular 19+ · NgRx SignalStore · PrimeNG `<p-tree>` · Zoneless.

The library is `layout-folder-management`. It exports one component (`FolderTreeComponent`) and two model interfaces (`SessionNode`, `Layout`).

### Data flow

```
Parent inputs          Component internals
──────────────         ──────────────────────────────────
[sessions] ──►  effect() → store.initData()
[layouts]  ──►       ↓
                 SignalStore (sessions, layoutsById, selectedFileId)
                     ↓
                 computed treeNodes → linkedSignal treeValue
                     ↓
                 <p-tree [value]="treeValue()">
```

### Key design decisions

- **Two-source model** — `sessions` (hierarchy) and `layouts` (flat metadata) are kept separate so each can be refreshed independently.
- **Component-scoped store** — `providers: [FolderTreeStore]` on the component gives each instance its own state.
- **linkedSignal** — bridges the reactive store with PrimeNG's mutative tree. On each recomputation it deep-copies nodes, restores `expanded` state, and wires `parent` references for drag-and-drop.
- **Drag-drop** — after PrimeNG mutates the tree in-place, we find the node's new location by scanning the mutated array, then apply `store.moveNode()` inside a `setTimeout` to decouple from PrimeNG's synchronous event loop.

### Key files

| File | Purpose |
|------|---------|
| `lib/models/folder-tree.models.ts` | `SessionNode`, `Layout`, `NodeData` types |
| `lib/store/tree-helpers.ts` | Pure tree functions (`structuredClone`-based) |
| `lib/store/folder-tree.store.ts` | NgRx SignalStore |
| `lib/components/folder-tree.component.ts` | UI: `linkedSignal`, `input()`, `output()` |
| `src/app/services/folder-api.service.ts` | Mock data for the demo app |
