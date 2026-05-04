# Folder management system

PrimeNG `<p-tree>` + NgRx SignalStore. Files & folders are draggable, reorderable,
deletable; folders are renamable.

## Architecture

Two API endpoints feed the tree:

| Endpoint   | Shape                       | Purpose                                            |
| ---------- | --------------------------- | -------------------------------------------------- |
| `sessions` | hierarchical `SessionNode[]` | Persisted folder structure. Source of truth for hierarchy. |
| `views`    | flat `ViewMeta[]`            | File metadata: `name`, `lastUpdated`, `lastViewed`. Joined by `id`. |

### Why keep them separate?

Joining server-side ties two concerns together (structure vs. metadata refresh).
By keeping `sessions: SessionNode[]` and `viewsById: Record<string, ViewMeta>`
as separate slices, we can:

- Refresh views (timestamps, names) without touching the tree shape
- Persist only the sessions slice when the user moves things around
- Project to PrimeNG `TreeNode[]` lazily via a `computed` signal

### Data flow

```
  fetchSessions()  ┐
                   ├──> patchState ──> sessions: SessionNode[]   ┐
  fetchViews()     ┘                  viewsById: ViewMeta map    │
                                                                 │
                                       computed treeNodes  <─────┘
                                              │
                                              ▼
                                       <p-tree [value]="treeNodes()">
```

The component never mutates `treeNodes`. Drag-drop, delete, rename all call
store methods that operate on the canonical `sessions` shape.

## Key files

- `models/folder-tree.models.ts` — domain types (`SessionNode`, `ViewMeta`, `NodeData`)
- `services/folder-api.service.ts` — mock for `/sessions` and `/views`
- `store/tree-helpers.ts` — pure tree functions (find, insert, remove, rename, cycle check). No Angular.
- `store/folder-tree.store.ts` — SignalStore with `withState` / `withComputed` / `withMethods` / `withHooks`
- `components/folder-tree.component.ts` — UI. OnPush, zoneless-friendly. Delegates everything to the store.

## Drag-drop semantics

PrimeNG mutates its internal copy of the tree on drop, but our `treeNodes`
is a *derived* signal — that mutation has no effect on our state. We capture
`dragNode` + `dropNode` + `index` from the `(onNodeDrop)` event and re-apply
the move via `store.moveNode(...)`.

The store enforces:

- Files cannot receive drops (only folders are valid drop targets)
- A folder cannot be dropped into itself or any of its descendants (cycle)
- Index adjustment when reordering within the same parent (remove-then-insert
  shifts indices by one)

## Run

```bash
npm install
npm start
```

Open `http://localhost:4200`.
