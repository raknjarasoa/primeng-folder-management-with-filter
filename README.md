# Folder Management

A reusable Angular 19+ folder-tree widget built with **PrimeNG `<p-tree>`** and **NgRx SignalStore**.

**Features:** drag-and-drop reordering · inline folder rename · file selection · search filtering · multi-instance isolation.

## Quick start

```bash
npm install
npm start        # http://localhost:4200
```

## How it works

The library (`layout-folder-management`) is a single standalone component: `<app-folder-tree>`.  
Your app fetches data and passes it in — the component handles the rest.

```
App                         <app-folder-tree>
───                         ─────────────────
[sessions] ──►  input()  ──►  Store  ──►  linkedSignal  ──►  <p-tree>
[layouts]  ──►  input()  ──►  Store  ──►  linkedSignal  ──►  <p-tree>

(sessionsChange)  ◄──  Drag / Drop / Rename / Delete
```

### Two inputs, one tree

| Input      | Shape                        | Purpose                                     |
| ---------- | ---------------------------- | ------------------------------------------- |
| `sessions` | `SessionNode[]` (hierarchy)  | Folder structure — source of truth for shape |
| `layouts`  | `Layout[]` (flat list)       | File metadata (name, timestamps), joined by `id` |

Keeping them separate lets you refresh metadata without touching the hierarchy, and persist only the structure on drag-and-drop.

### Multi-instance

The store is provided at the component level, so every `<app-folder-tree>` gets its own isolated state. The demo app shows two instances side-by-side.

### Drag-and-drop

PrimeNG mutates the tree array in place. The component locates the dropped node's new position in the mutated tree and applies it to the store via `store.moveNode()` inside a short `setTimeout` to keep the UI smooth.

**Guards:** files cannot receive drops; cycles are prevented (a folder cannot be dropped into itself or its children).

## Project structure

```
projects/layout-folder-management/src/lib/
├── models/folder-tree.models.ts    # SessionNode, Layout, NodeData
├── store/tree-helpers.ts           # Pure immutable tree functions (structuredClone)
├── store/folder-tree.store.ts      # NgRx SignalStore (component-scoped)
└── components/
    ├── folder-tree.component.ts    # linkedSignal, input(), output()
    ├── folder-tree.component.html  # PrimeNG <p-tree> template
    └── folder-tree.component.css   # Minimal scoped styles

src/app/
├── app.component.ts                # Demo: dual-instance layout
├── app.config.ts                   # Zoneless + PrimeNG Aura theme
└── services/folder-api.service.ts  # Mock data
```
