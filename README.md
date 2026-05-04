# Folder management system

An Angular 19+ library using PrimeNG `<p-tree>` and NgRx SignalStore to provide an interactive, reusable folder and layout management widget. Features include native drag-and-drop reordering, inline folder renaming, file selection, search filtering, and multi-instance isolation.

## Architecture

The system is built as a highly reusable, purely presentational/stateful "dumb" component library (`layout-folder-management`). It does not handle HTTP requests directly. Instead, your application fetches the data and passes it down.

Two data models feed the tree:

| Model      | Shape                       | Purpose                                            |
| ---------- | --------------------------- | -------------------------------------------------- |
| `sessions` | hierarchical `SessionNode[]` | Persisted folder structure. Source of truth for hierarchy. |
| `layouts`  | flat `Layout[]`              | File metadata: `name`, `lastUpdated`, `lastViewDate`. Joined by `id`. |

### Why keep them separate?

Joining server-side ties two concerns together (structure vs. metadata refresh).
By keeping `sessions` and `layouts` separate, you can:
- Refresh layout metadata (timestamps, names) independently of the structural tree shape.
- Persist only the `sessions` hierarchy when the user moves things around.
- Lazily compute the PrimeNG UI tree via `computed` and `linkedSignal`.

### Data flow

The library manages the local UI state using an internal NgRx SignalStore. Changes are emitted via Angular outputs.

```
  Parent App         <app-folder-tree> (Library)
  ----------         ---------------------------
  sessions()   ──>   input() ──> Store ──> linkedSignal ──> PrimeNG <p-tree>
  layouts()    ──>   input() ──> Store ──> linkedSignal ──> PrimeNG <p-tree>
  
  save()       <──   (sessionsChange)  <──  Drag/Drop, Rename, Delete
```

## Key files (projects/layout-folder-management/src/lib/)

- `models/folder-tree.models.ts` — Domain types (`SessionNode`, `Layout`, `NodeData`)
- `store/tree-helpers.ts` — Pure, immutable tree manipulation functions (insert, remove, rename, cycle check) powered by modern `structuredClone`.
- `store/folder-tree.store.ts` — NgRx SignalStore. Provided at the component level to support true multi-instance capability.
- `components/folder-tree.component.ts` — Modern Angular v19 component using `linkedSignal`, `input()`, and `output()`.

## Drag-drop semantics

PrimeNG mutates its internal copy of the tree on drop natively. 
Our component bridges this gap gracefully using Angular v19's `linkedSignal`. 
We capture the `dragNode` and `newParent` from the `(onNodeDrop)` event, explicitly maintain the `parent` property pointers so native array splicing works correctly, and apply the permanent move via `store.moveNode(...)`.

The store enforces:
- Files cannot receive drops (only folders are valid drop targets).
- Cycle prevention (a folder cannot be dropped into itself or its descendants).

## Run

```bash
npm install
npm start
```

Open `http://localhost:4200` to see the dual-instance demonstration.
