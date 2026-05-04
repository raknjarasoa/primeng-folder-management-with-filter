import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { TreeModule, TreeNodeDropEvent } from 'primeng/tree';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TreeDragDropService, TreeNode } from 'primeng/api';

import { FolderTreeStore } from '../store/folder-tree.store';
import { NodeData } from '../models/folder-tree.models';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TreeModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    DatePipe,
  ],
  providers: [TreeDragDropService],
  template: `
    <div class="layout">
      <header class="header">
        <h1>Folder management</h1>
        <p class="hint">
          Drag to reorder · drop into folders · double-click a folder to rename ·
          click a file to select it
        </p>
      </header>

      <!-- Toolbar: search + add folder -->
      <div class="toolbar">
        <div class="search-wrapper">
          <i class="pi pi-search search-icon"></i>
          <input
            pInputText
            class="search-input"
            placeholder="Search folders and files…"
            [ngModel]="filterText()"
            (ngModelChange)="onFilterChange($event)"
          />
          @if (filterText()) {
            <button
              pButton
              icon="pi pi-times"
              text
              rounded
              size="small"
              class="clear-btn"
              (click)="onFilterChange('')"
            ></button>
          }
        </div>
        <button
          pButton
          icon="pi pi-folder-plus"
          label="New folder"
          outlined
          size="small"
          (click)="onAddFolder()"
        ></button>
      </div>

      @if (store.loading()) {
        <div class="status">Loading…</div>
      } @else if (store.error()) {
        <div class="status error">{{ store.error() }}</div>
      } @else {
        <p-tree
          [value]="treeValue"
          [draggableNodes]="!isFiltering()"
          [droppableNodes]="!isFiltering()"
          draggableScope="folder-tree"
          droppableScope="folder-tree"
          selectionMode="single"
          [selection]="selectedNode"
          (selectionChange)="onSelectionChange($event)"
          (onNodeDrop)="onNodeDrop($event)"
          styleClass="tree"
        >
          <ng-template let-node pTemplate="default">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: node }" />
          </ng-template>
          <ng-template let-node pTemplate="file">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: node }" />
          </ng-template>
        </p-tree>

        @if (treeValue.length === 0 && isFiltering()) {
          <div class="status">No results for "{{ filterText() }}"</div>
        }

        <!-- Single row template reused for folder + file -->
        <ng-template #row let-node>
          <div class="row" [class.selected-file]="node.data.kind === 'file' && store.selectedFileId() === node.data.id">
            <!-- Folder rename inline editor -->
            @if (node.data.kind === 'folder' && editingId() === node.data.id) {
              <input
                pInputText
                class="rename-input"
                [ngModel]="editingValue()"
                (ngModelChange)="editingValue.set($event)"
                (keydown.enter)="commitRename(node.data.id)"
                (keydown.escape)="cancelRename()"
                autofocus
              />
              <button
                pButton
                icon="pi pi-check"
                text
                rounded
                size="small"
                severity="success"
                class="confirm-btn"
                (click)="commitRename(node.data.id); $event.stopPropagation()"
              ></button>
            } @else {
              <span
                class="label"
                (dblclick)="
                  node.data.kind === 'folder' &&
                    startRename(node.data.id, node.label)
                "
              >
                {{ node.label }}
              </span>
            }

            <!-- File metadata -->
            @if (node.data.kind === 'file' && node.data.view) {
              <span class="meta">
                updated {{ node.data.view.lastUpdated | date: 'MMM d, HH:mm' }}
                · viewed
                {{ node.data.view.lastViewed | date: 'MMM d, HH:mm' }}
              </span>
            }

            <span class="actions">
              @if (node.data.kind === 'folder' && editingId() !== node.data.id) {
                <button
                  pButton
                  icon="pi pi-folder-plus"
                  text
                  rounded
                  size="small"
                  pTooltip="Add subfolder"
                  (click)="onAddFolder(node.data.id); $event.stopPropagation()"
                ></button>
                <button
                  pButton
                  icon="pi pi-pencil"
                  text
                  rounded
                  size="small"
                  pTooltip="Rename"
                  (click)="startRename(node.data.id, node.label); $event.stopPropagation()"
                ></button>
              }
              <button
                pButton
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                pTooltip="Delete"
                (click)="onDelete(node.data); $event.stopPropagation()"
              ></button>
            </span>
          </div>
        </ng-template>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          'Segoe UI',
          Roboto,
          sans-serif;
      }

      .layout {
        max-width: 720px;
        margin: 0 auto;
        padding: 24px;
      }

      .header h1 {
        font-size: 20px;
        margin: 0 0 4px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .hint {
        margin: 0 0 16px;
        font-size: 12px;
        color: #6b7280;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .search-wrapper {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
      }

      .search-icon {
        position: absolute;
        left: 10px;
        color: #9ca3af;
        font-size: 14px;
        pointer-events: none;
      }

      .search-input {
        width: 100%;
        padding-left: 32px !important;
        font-size: 13px;
        height: 34px;
      }

      .clear-btn {
        position: absolute;
        right: 4px;
      }

      .status {
        padding: 12px 16px;
        border-radius: 6px;
        background: #f3f4f6;
        font-size: 14px;
      }
      .status.error {
        background: #fef2f2;
        color: #991b1b;
      }

      .tree {
        --p-tree-padding: 4px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 2px 4px;
        border-radius: 4px;
        transition: background 0.1s;
      }

      .row.selected-file {
        background: #eff6ff;
      }

      .label {
        font-size: 14px;
        cursor: text;
        user-select: none;
      }

      .meta {
        font-size: 11px;
        color: #9ca3af;
        margin-left: auto;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .actions {
        display: flex;
        gap: 2px;
        opacity: 0;
        transition: opacity 0.12s;
      }

      .row:hover .actions {
        opacity: 1;
      }

      .rename-input {
        font-size: 14px;
        padding: 2px 6px;
        height: 26px;
      }

      .confirm-btn {
        flex-shrink: 0;
      }
    `,
  ],
})
export class FolderTreeComponent {
  protected readonly store = inject(FolderTreeStore);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Mutable tree for PrimeNG. Deep-copied from the store when data changes.
   * PrimeNG owns this array and mutates it in place for expand/collapse and drag-drop.
   */
  treeValue: TreeNode<NodeData>[] = [];

  /** Currently selected tree node (for PrimeNG's selectionMode="single"). */
  selectedNode: TreeNode<NodeData> | null = null;

  // -- Local UI state
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  protected readonly filterText = signal<string>('');
  protected readonly isFiltering = signal<boolean>(false);

  /** Track whether we should skip the next sync (because we just did a drag-drop). */
  private skipNextSync = false;
  /** True only for the initial load — used to auto-expand to the selected file. */
  private isInitialLoad = true;

  constructor() {
    // Sync store → mutable tree whenever the store's projection changes.
    effect(() => {
      const storeNodes = this.store.treeNodes();
      const selectedId = this.store.selectedFileId();

      if (this.skipNextSync) {
        this.skipNextSync = false;
        return;
      }

      // Capture which nodes are currently expanded.
      const expandedKeys = this.collectExpandedKeys(this.treeValue);

      // On initial load, auto-expand to the selected file.
      if (this.isInitialLoad && selectedId) {
        const ancestors = this.store.selectedFileAncestors();
        ancestors.forEach((k) => expandedKeys.add(k));
        this.isInitialLoad = false;
      }

      // Apply filter if active, otherwise use full tree.
      const filter = this.filterText().trim().toLowerCase();
      const sourceNodes = filter
        ? this.filterTree(storeNodes, filter)
        : storeNodes;

      // Deep copy from store and restore expanded state.
      this.treeValue = this.deepCopyWithExpanded(sourceNodes, expandedKeys);

      // Restore PrimeNG selection reference.
      if (selectedId) {
        this.selectedNode =
          this.findNodeByKey(this.treeValue, selectedId) ?? null;
      } else {
        this.selectedNode = null;
      }

      this.cdr.markForCheck();
    });
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  protected onFilterChange(value: string): void {
    this.filterText.set(value);
    this.isFiltering.set(value.trim().length > 0);
    // Trigger re-sync by reading store nodes.
    this.syncTreeFromStore();
  }

  protected onSelectionChange(node: TreeNode<NodeData> | TreeNode<NodeData>[] | null): void {
    // Single selection mode → node is a single TreeNode or null.
    const selected = Array.isArray(node) ? node[0] : node;
    if (selected?.data?.kind === 'file') {
      this.store.selectFile(selected.data.id);
      this.selectedNode = selected;
    } else {
      // Clicking a folder: don't change file selection, just let PrimeNG toggle expand.
      // Re-set the selection to the currently selected file.
      if (this.store.selectedFileId()) {
        this.selectedNode =
          this.findNodeByKey(this.treeValue, this.store.selectedFileId()!) ?? null;
      }
    }
  }

  protected onNodeDrop(event: TreeNodeDropEvent): void {
    const dragNode = event.dragNode as TreeNode<NodeData> | undefined;
    if (!dragNode?.data) return;

    const draggedId = dragNode.data.id;
    const newParent = dragNode.parent as TreeNode<NodeData> | undefined;

    if (newParent && newParent.data?.kind !== 'folder') {
      this.store.load();
      return;
    }

    const targetFolderId: string | null = newParent?.data?.id ?? null;
    const siblings: TreeNode<NodeData>[] = newParent?.children ?? this.treeValue;
    const newIndex = siblings.findIndex((n) => n.data?.id === draggedId);

    this.skipNextSync = true;
    this.store.moveNode(
      draggedId,
      targetFolderId,
      newIndex >= 0 ? newIndex : undefined,
    );
  }

  protected onAddFolder(parentId: string | null = null): void {
    const name = prompt('New folder name:', 'New folder');
    if (!name?.trim()) return;
    const newId = this.store.addFolder(parentId, name.trim());
    // After the effect syncs, expand the parent so the new folder is visible.
    // We do this by adding the parent to expanded keys during the next sync.
    if (parentId) {
      // Force expand the parent in the current mutable tree so the user sees the new folder.
      const parentNode = this.findNodeByKey(this.treeValue, parentId);
      if (parentNode) parentNode.expanded = true;
    }
  }

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue();
    if (this.editingId() === id) {
      this.store.renameFolder(id, value);
      this.editingId.set(null);
    }
  }

  protected cancelRename(): void {
    this.editingId.set(null);
  }

  protected onDelete(data: NodeData): void {
    const what = data.kind === 'folder' ? 'folder' : 'file';
    if (confirm(`Delete this ${what}?`)) {
      this.store.deleteNode(data.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Trigger a store → tree re-sync. */
  private syncTreeFromStore(): void {
    const storeNodes = this.store.treeNodes();
    const expandedKeys = this.collectExpandedKeys(this.treeValue);
    const filter = this.filterText().trim().toLowerCase();
    const sourceNodes = filter
      ? this.filterTree(storeNodes, filter)
      : storeNodes;

    this.treeValue = this.deepCopyWithExpanded(
      sourceNodes,
      filter ? this.collectAllKeys(sourceNodes) : expandedKeys,
    );

    // Restore selection reference.
    const selectedId = this.store.selectedFileId();
    if (selectedId) {
      this.selectedNode =
        this.findNodeByKey(this.treeValue, selectedId) ?? null;
    }

    this.cdr.markForCheck();
  }

  /**
   * Filter tree: keep nodes whose label matches, plus all their ancestors.
   * When filtering, folders that don't match but have matching descendants are kept.
   */
  private filterTree(
    nodes: TreeNode<NodeData>[],
    query: string,
  ): TreeNode<NodeData>[] {
    const result: TreeNode<NodeData>[] = [];
    for (const node of nodes) {
      const labelMatch = (node.label ?? '').toLowerCase().includes(query);
      if (node.children?.length) {
        const filteredChildren = this.filterTree(node.children, query);
        if (labelMatch || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
            expanded: true, // auto-expand in filter mode
          });
        }
      } else {
        if (labelMatch) result.push(node);
      }
    }
    return result;
  }

  /** Collect all keys in a tree (used to expand all during filtering). */
  private collectAllKeys(nodes: TreeNode<NodeData>[]): Set<string> {
    const keys = new Set<string>();
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.key) keys.add(n.key);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }

  /** Find a node by key in the mutable tree (recursive). */
  private findNodeByKey(
    nodes: TreeNode<NodeData>[],
    key: string,
  ): TreeNode<NodeData> | undefined {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = this.findNodeByKey(n.children, key);
        if (found) return found;
      }
    }
    return undefined;
  }

  /** Collect keys of expanded nodes from the current mutable tree. */
  private collectExpandedKeys(nodes: TreeNode<NodeData>[]): Set<string> {
    const keys = new Set<string>();
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.expanded && n.key) keys.add(n.key);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }

  /** Deep-copy tree nodes and restore expanded state from a keyset. */
  private deepCopyWithExpanded(
    nodes: TreeNode<NodeData>[],
    expandedKeys: Set<string>,
  ): TreeNode<NodeData>[] {
    return nodes.map((n) => this.copyNode(n, expandedKeys));
  }

  private copyNode(
    node: TreeNode<NodeData>,
    expandedKeys: Set<string>,
  ): TreeNode<NodeData> {
    const copy: TreeNode<NodeData> = { ...node };
    if (node.key && expandedKeys.has(node.key)) {
      copy.expanded = true;
    }
    if (node.children) {
      copy.children = node.children.map((c) => this.copyNode(c, expandedKeys));
    }
    delete (copy as any).parent;
    return copy;
  }
}
