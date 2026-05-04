# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # dev server at http://localhost:4200
npm run build      # production build → dist/folder-management/
npm run watch      # incremental dev build (no server)
```

No test runner is configured; there are no test files.

## Architecture

Angular 19 + NgRx SignalStore + PrimeNG `<p-tree>`. Standalone components, OnPush, no routing.

### Two-source data model

The tree is fed by two separate mock endpoints in `FolderApiService`:

| Source | Shape | Role |
|---|---|---|
| `fetchSessions()` | `SessionNode[]` (hierarchical) | Folder structure — source of truth for tree shape |
| `fetchViews()` | `ViewMeta[]` (flat) | File metadata (name, timestamps) — joined to leaves by `id` |

These are kept separate so the hierarchy (`sessions`) and file metadata (`viewsById`) can be updated independently. The store joins them at projection time via a `computed` signal (`treeNodes`), which is what `<p-tree>` consumes.

### State → UI flow

```
FolderApiService.fetchSessions()  ──┐
                                    ├─> patchState ─> sessions: SessionNode[]   ─┐
FolderApiService.fetchViews()     ──┘               viewsById: Record<id,View>  ─┤
                                                                                  │
                                         withComputed → treeNodes (TreeNode[]) <─┘
                                                │
                                         <p-tree [value]="treeNodes()">
```

The component never writes to `treeNodes`. All mutations (drag-drop, delete, rename) call store methods that update `sessions`, and `treeNodes` recomputes automatically.

### Key files

- `src/app/models/folder-tree.models.ts` — `SessionNode`, `ViewMeta`, `NodeData` types
- `src/app/services/folder-api.service.ts` — mock for the two endpoints; swap for `HttpClient` calls in production
- `src/app/store/tree-helpers.ts` — pure functions on `SessionNode[]`: `findLocation`, `removeNode`, `insertNode`, `renameFolder`, `isAncestorOrSelf`. No Angular dependencies; testable in isolation.
- `src/app/store/folder-tree.store.ts` — NgRx `signalStore` with `load` (rxMethod), `moveNode`, `deleteNode`, `renameFolder`, and the `treeNodes` computed projection
- `src/app/components/folder-tree.component.ts` — sole UI component; injects `FolderTreeStore`, owns local rename signals (`editingId`, `editingValue`)

### Drag-drop semantics

PrimeNG mutates its internal tree in-place before firing `(onNodeDrop)`. Because `treeNodes` is a derived signal, that mutation is discarded on the next render. The component reads back PrimeNG's post-mutation tree (`dragNode.parent`, sibling array) to determine the final position, then calls `store.moveNode(draggedId, targetFolderId, newIndex)`.

`moveNode` enforces two invariants via `tree-helpers`:
1. Cycle prevention — a folder cannot be dropped into itself or any descendant (`isAncestorOrSelf`)
2. Files cannot receive drops — `droppable: false` is set during projection; any leak falls back to `store.load()` to reset

### Adding a real HTTP backend

Replace the `of(...).pipe(delay(...))` observables in `FolderApiService` with `HttpClient` calls. The store (`rxMethod` with `forkJoin`) and projection logic require no changes.
