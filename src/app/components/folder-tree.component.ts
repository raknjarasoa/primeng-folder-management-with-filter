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
    DatePipe,
  ],
  providers: [TreeDragDropService],
  template: `
    <div class="layout">
      <header class="header">
        <h1>Folder management</h1>
        <p class="hint">
          Drag to reorder · drop into folders · double-click a folder to rename ·
          hover for actions
        </p>
      </header>

      @if (store.loading()) {
        <div class="status">Loading…</div>
      } @else if (store.error()) {
        <div class="status error">{{ store.error() }}</div>
      } @else {
        <p-tree
          [value]="treeValue"
          [draggableNodes]="true"
          [droppableNodes]="true"
          draggableScope="folder-tree"
          droppableScope="folder-tree"
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

        <!-- Single row template reused for folder + file -->
        <ng-template #row let-node>
          <div class="row">
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
   * Mutable tree for PrimeNG. We deep-copy from the store only when the
   * store data actually changes (load, delete, rename). PrimeNG owns this
   * array and mutates it in place for expand/collapse and drag-drop.
   */
  treeValue: TreeNode<NodeData>[] = [];

  // -- Local UI state: which folder is being renamed, and its draft value.
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');

  /** Track whether we should skip the next sync (because we just did a drag-drop). */
  private skipNextSync = false;

  constructor() {
    // Sync store → mutable tree whenever the store's projection changes.
    // This fires on initial load, delete, rename, moveNode, etc.
    effect(() => {
      const storeNodes = this.store.treeNodes();
      if (this.skipNextSync) {
        this.skipNextSync = false;
        return;
      }
      // Capture which nodes are currently expanded.
      const expandedKeys = this.collectExpandedKeys(this.treeValue);
      // Deep copy from store and restore expanded state.
      this.treeValue = this.deepCopyWithExpanded(storeNodes, expandedKeys);
      this.cdr.markForCheck();
    });
  }

  /**
   * PrimeNG has already mutated `treeValue` in-place before this fires.
   * `dragNode.parent` reflects the new parent. We sync to the store,
   * but skip the effect's re-sync since PrimeNG's tree is already correct.
   */
  protected onNodeDrop(event: TreeNodeDropEvent): void {
    const dragNode = event.dragNode as TreeNode<NodeData> | undefined;
    if (!dragNode?.data) return;

    const draggedId = dragNode.data.id;
    const newParent = dragNode.parent as TreeNode<NodeData> | undefined;

    // Files cannot be parents.
    if (newParent && newParent.data?.kind !== 'folder') {
      this.store.load();
      return;
    }

    const targetFolderId: string | null = newParent?.data?.id ?? null;
    const siblings: TreeNode<NodeData>[] = newParent?.children ?? this.treeValue;
    const newIndex = siblings.findIndex((n) => n.data?.id === draggedId);

    // Tell the effect to skip the next sync — PrimeNG's tree is already correct.
    this.skipNextSync = true;
    this.store.moveNode(
      draggedId,
      targetFolderId,
      newIndex >= 0 ? newIndex : undefined,
    );
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
    // PrimeNG sets .parent references internally; don't carry stale ones.
    delete (copy as any).parent;
    return copy;
  }
}
