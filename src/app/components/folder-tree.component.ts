import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  // TreeDragDropService is required for drag-drop within a single tree.
  providers: [TreeDragDropService],
  template: `
    <div class="layout">
      <header class="header">
        <h1>Folder management</h1>
        <p class="hint">
          Drag to reorder · drop into folders · double-click a folder to rename ·
          hover for delete
        </p>
      </header>

      @if (store.loading()) {
        <div class="status">Loading…</div>
      } @else if (store.error()) {
        <div class="status error">{{ store.error() }}</div>
      } @else {
        <p-tree
          [value]="store.treeNodes()"
          [draggableNodes]="true"
          [droppableNodes]="true"
          draggableScope="folder-tree"
          droppableScope="folder-tree"
          [validateDrop]="true"
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
            @if (
              node.data.kind === 'folder' && editingId() === node.data.id
            ) {
              <input
                pInputText
                class="rename-input"
                [ngModel]="editingValue()"
                (ngModelChange)="editingValue.set($event)"
                (keydown.enter)="commitRename(node.data.id)"
                (keydown.escape)="cancelRename()"
                (blur)="commitRename(node.data.id)"
                #renameInput
                autofocus
              />
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
              @if (node.data.kind === 'folder') {
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
    `,
  ],
})
export class FolderTreeComponent {
  protected readonly store = inject(FolderTreeStore);

  // -- Local UI state: which folder is being renamed, and its draft value.
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');

  /**
   * PrimeNG mutates its own input tree IN PLACE before firing onNodeDrop.
   * The `event.index` semantics are notoriously inconsistent across versions
   * and drop locations (folder vs. between-siblings, last-position off-by-one,
   * etc — see PrimeNG issues #9320, #9502, #13592).
   *
   * Instead of interpreting the event, we read back PrimeNG's *post-mutation*
   * tree via `dragNode.parent` and the sibling array. This is the ground
   * truth of where PrimeNG put the node, which we replicate in store state.
   *
   * Cycle prevention is enforced inside moveNode(); if the move is rejected,
   * the canonical tree re-emits and PrimeNG re-renders the unmoved version.
   */
  protected onNodeDrop(event: TreeNodeDropEvent): void {
    const dragNode = event.dragNode as TreeNode<NodeData> | undefined;
    if (!dragNode?.data) return;

    const draggedId = dragNode.data.id;
    // After PrimeNG's in-place mutation, dragNode.parent is the new parent
    // (undefined when the node now sits at root level).
    const newParent = dragNode.parent as TreeNode<NodeData> | undefined;

    // Defensive: files cannot be parents. droppable:false should prevent this,
    // but if PrimeNG ever lets it through, force a state reload to un-do.
    if (newParent && newParent.data?.kind !== 'folder') {
      this.store.load();
      return;
    }

    const targetFolderId: string | null = newParent?.data?.id ?? null;
    const siblings = newParent?.children ?? this.store.treeNodes();
    const newIndex = siblings.findIndex((n) => n.data?.id === draggedId);

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
}
