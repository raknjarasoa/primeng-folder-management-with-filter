import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoFocus } from 'primeng/autofocus';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';

import { FlatRowData, TreeItem } from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import { FolderTreeStore } from '../store/folder-tree.store';
import {
  collectSubtreeIds,
  DropZone,
  OTHERS_ROOT_ID,
} from '../store/tree-helpers';
import {
  MoveFolderPickerComponent,
  MoveFolderRequest,
} from './move-folder-picker.component';
import { TreeAutoscroller } from './tree-autoscroller';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FolderTreeStore],
  imports: [FormsModule, AutoFocus, MoveFolderPickerComponent, ScrollingModule],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  readonlyInstance = input(false);
  sessions = model.required<TreeItem[]>();
  layouts = input<LayoutInstance[]>([]);
  selectedFileId = model.required<string | null>();

  fileSelected = output<string>();

  protected readonly store = inject(FolderTreeStore);

  protected readonly OTHERS_ROOT_ID = OTHERS_ROOT_ID;

  // Must match the row CSS height. CDK virtual scroll places rows by index *
  // ROW_HEIGHT; if these diverge you'll see overlap or gaps.
  protected readonly ROW_HEIGHT = 28;
  protected readonly INDENT_PX = 16;

  private readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');
  private readonly movePicker =
    viewChild<MoveFolderPickerComponent>('movePicker');

  // ---------------------------------------------------------------------------
  // Drag scratch state — captured at drag start, consumed on move / release.
  // ---------------------------------------------------------------------------
  private dragForbiddenIds: Set<string> = new Set();
  private draggedRowId: string | null = null;

  private readonly autoscroller = new TreeAutoscroller(
    () => this.viewport()?.elementRef.nativeElement,
    {
      onScrollTick: (pointerY) => this.recomputeDropTargetAtPointerY(pointerY),
    },
  );

  // ---------------------------------------------------------------------------
  // Backward compatibility getters for unit tests
  // ---------------------------------------------------------------------------

  private createStoreSignalWrapper<T>(
    getter: () => T,
    updater: (value: T) => void,
  ) {
    const fn = getter as any;
    fn.set = updater;
    fn.update = (updateFn: (val: T) => T) => {
      updater(updateFn(getter()));
    };
    return fn;
  }

  protected get filterText() {
    return this.createStoreSignalWrapper(
      () => this.store.filterText(),
      (v) => this.store.updateFilterText(v),
    );
  }

  protected get editingId() {
    return this.createStoreSignalWrapper(
      () => this.store.editingId(),
      (v) => this.store.setEditingId(v),
    );
  }

  protected get editingValue() {
    return this.createStoreSignalWrapper(
      () => this.store.editingValue(),
      (v) => this.store.setEditingValue(v),
    );
  }

  protected get creatingId() {
    return this.createStoreSignalWrapper(
      () => this.store.creatingId(),
      (v) => this.store.setCreatingId(v),
    );
  }

  protected get expandedIds() {
    return this.createStoreSignalWrapper(
      () => this.store.expandedIds(),
      (v) => this.store.setExpandedIds(v),
    );
  }

  protected get flatRows() {
    return () => this.store.flatRows();
  }

  protected get isFiltering() {
    return () => this.store.isFiltering();
  }

  protected get dropTarget() {
    return this.createStoreSignalWrapper(
      () => this.store.dropTarget(),
      (v) => this.store.setDropTarget(v),
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle effects
  // ---------------------------------------------------------------------------

  constructor() {
    // Sync incoming inputs/models to store state
    effect(() => {
      this.store.setSessions(this.sessions());
    });
    effect(() => {
      this.store.setLayouts(this.layouts());
    });
    effect(() => {
      this.store.setSelectedFileId(this.selectedFileId());
    });

    // Sync store updates back to component models
    effect(() => {
      const storeSessions = this.store.sessions();
      untracked(() => {
        if (this.sessions() !== storeSessions) {
          this.sessions.set(storeSessions);
        }
      });
    });
    effect(() => {
      const storeSelectedId = this.store.selectedFileId();
      untracked(() => {
        if (this.selectedFileId() !== storeSelectedId) {
          this.selectedFileId.set(storeSelectedId);
        }
      });
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.autoscroller.stop();
    });
  }

  // ---------------------------------------------------------------------------
  // Row interaction
  // ---------------------------------------------------------------------------

  protected onRowClick(row: FlatRowData): void {
    if (row.kind === 'file') {
      this.store.setSelectedFileId(row.id);
      this.selectedFileId.set(row.id);
      this.fileSelected.emit(row.id);
    } else if (row.hasChildren) {
      this.store.toggleExpand(row.id);
    }
  }

  protected toggleExpand(id: string, event?: Event): void {
    event?.stopPropagation();
    this.store.toggleExpand(id);
  }

  protected trackRowId = (_: number, row: FlatRowData): string => row.id;

  // ---------------------------------------------------------------------------
  // Drag and drop — custom hit detection compatible with virtual scroll
  // ---------------------------------------------------------------------------

  protected canDrag(row: FlatRowData): boolean {
    return (
      !row.isOther && row.id !== OTHERS_ROOT_ID && !this.store.isFiltering()
    );
  }

  /**
   * Finds the drop target index and sub-zone under the cursor coordinates relative to the viewport.
   * Updates dropTarget signal.
   *
   * @param pointerYInViewport The mouse/pointer pointer coordinate.
   */
  private recomputeDropTargetAtPointerY(pointerYInViewport: number): void {
    const vp = this.viewport();
    if (!vp) return;

    const element = vp.elementRef.nativeElement;

    // Clamp the pointer coordinate to valid viewport bounds [0, height - 1] to keep drop targets active at the boundaries
    const rect = this.autoscroller.getViewportRect();
    const viewportHeight = rect ? rect.height : element.clientHeight;
    const clampedPointerY = Math.max(
      0,
      Math.min(viewportHeight - 1, pointerYInViewport),
    );

    const scrollOffset = element.scrollTop;
    const pointerY = clampedPointerY + scrollOffset;
    const rowIndex = Math.floor(pointerY / this.ROW_HEIGHT);
    const offsetInRow = pointerY - rowIndex * this.ROW_HEIGHT;

    const rows = this.store.flatRows();
    if (rowIndex < 0 || rowIndex >= rows.length) {
      this.store.setDropTarget(null);
      return;
    }

    const targetRow = rows[rowIndex];
    if (this.dragForbiddenIds.has(targetRow.id) || targetRow.isOther) {
      this.store.setDropTarget(null);
      return;
    }

    let zone: DropZone;
    if (targetRow.kind === 'folder') {
      if (offsetInRow < this.ROW_HEIGHT * 0.25) zone = 'before';
      else if (offsetInRow > this.ROW_HEIGHT * 0.75) zone = 'after';
      else zone = 'into';
    } else {
      zone = offsetInRow < this.ROW_HEIGHT / 2 ? 'before' : 'after';
    }

    const prev = this.store.dropTarget();
    if (!prev || prev.rowIndex !== rowIndex || prev.zone !== zone) {
      this.store.setDropTarget({ rowIndex, zone });
    }
  }

  /**
   * Performs the mutation on structural drop confirmation and stops autoscrolling.
   *
   * @param sourceId The ID of the item being dropped.
   */
  private completePendingDrag(sourceId: string): void {
    this.autoscroller.stop();
    this.draggedRowId = null;
    this.dragForbiddenIds = new Set();
    this.store.completeDragDrop(sourceId);
    this.sessions.set(this.store.sessions());
  }

  /**
   * Fired when a native drag session begins.
   *
   * @param event The native DragEvent.
   * @param sourceRow The metadata of the item being dragged.
   */
  protected onDragStart(event: DragEvent, sourceRow: FlatRowData): void {
    if (!this.canDrag(sourceRow)) {
      event.preventDefault();
      return;
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sourceRow.id);
    }

    if (this.draggedRowId !== null) {
      this.completePendingDrag(this.draggedRowId);
    }

    const vp = this.viewport();
    if (vp) {
      this.autoscroller.start(vp.elementRef.nativeElement);
    }

    this.draggedRowId = sourceRow.id;
    this.dragForbiddenIds = collectSubtreeIds(
      this.store.sessions(),
      sourceRow.id,
    );

    if (
      sourceRow.kind === 'folder' &&
      this.store.expandedIds().has(sourceRow.id)
    ) {
      this.store.collapseFolder(sourceRow.id);
    }
  }

  /**
   * Fired when a dragged element hovers over a row.
   *
   * @param event The native DragEvent.
   * @param targetRow The metadata of the row being hovered over.
   * @param rowIndex The zero-based index of the hovered row.
   */
  protected onDragOver(
    event: DragEvent,
    targetRow: FlatRowData,
    rowIndex: number,
  ): void {
    if (this.draggedRowId === null) {
      return;
    }

    const rect = this.autoscroller.getViewportRect();
    if (!rect) return;

    const pointerYInViewport = event.clientY - rect.top;

    const OUT_OF_BOUNDS_BUFFER = 30;
    if (
      pointerYInViewport < -OUT_OF_BOUNDS_BUFFER ||
      pointerYInViewport > rect.height + OUT_OF_BOUNDS_BUFFER
    ) {
      this.store.setDropTarget(null);
      this.autoscroller.pause();
      return;
    }

    // ALWAYS move the autoscroller so that scrolling up/down works even when hovering over read-only folders
    this.autoscroller.move(pointerYInViewport);

    // If target row is forbidden (descendant or synthetic other), hide drop-line marker and do NOT call preventDefault
    const isForbidden =
      this.dragForbiddenIds.has(targetRow.id) || targetRow.isOther;
    if (isForbidden) {
      this.store.setDropTarget(null);
      return;
    }

    // Allow dropping on valid drop zones and recompute drop-line position
    event.preventDefault();
    this.recomputeDropTargetAtPointerY(pointerYInViewport);
  }

  /**
   * Fired when a dragged element leaves a row.
   */
  protected onDragLeave(): void {
    // Optional: add lightweight dragleave logic if needed
  }

  /**
   * Fired when a native drag drop is completed over a row.
   *
   * @param event The native DragEvent.
   * @param targetRow The metadata of the row being dropped on.
   */
  protected onDragDrop(event: DragEvent, targetRow: FlatRowData): void {
    event.preventDefault();
    if (this.draggedRowId !== null) {
      this.completePendingDrag(this.draggedRowId);
    }
  }

  /**
   * Fired when a native drag operation is ended.
   */
  protected onDragEnd(): void {
    this.autoscroller.stop();
    this.draggedRowId = null;
    this.dragForbiddenIds = new Set();
    this.store.setDropTarget(null);
  }

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  protected onFilterChange(value: string): void {
    this.store.updateFilterText(value);
  }

  // ---------------------------------------------------------------------------
  // Add / rename / delete
  // ---------------------------------------------------------------------------

  /**
   * Triggered when creating a new folder in the directory tree.
   * Automatically unfolds parent structures and launches edit mode.
   *
   * @param parentId The parent ID to insert under, or null for root level.
   */
  protected onAddFolder(parentId: string | null = null): void {
    this.store.addFolder(parentId);
    this.sessions.set(this.store.sessions());
  }

  /**
   * Initiates edit mode on a folder's label name.
   *
   * @param id Unique identifier of the folder to rename.
   * @param currentLabel Current name of the folder.
   */
  protected startRename(id: string, currentLabel: string): void {
    this.store.startRename(id, currentLabel);
  }

  /**
   * Saves the edit name mutation and leaves edit mode.
   *
   * @param id The folder being renamed.
   */
  protected commitRename(id: string): void {
    this.store.commitRename(id);
    this.sessions.set(this.store.sessions());
  }

  /**
   * Cancels any active folder rename session. Removes newly created empty folders.
   */
  protected cancelRename(): void {
    this.store.cancelRename();
    this.sessions.set(this.store.sessions());
  }

  /**
   * Handles the text input blur event when renaming a folder.
   *
   * @param id Unique folder ID.
   */
  protected onRenameInputBlur(id: string): void {
    const value = this.store.editingValue().trim();
    if (value) {
      this.store.commitRename(id);
    } else {
      this.store.cancelRename();
    }
    this.sessions.set(this.store.sessions());
  }

  /**
   * Deletes a folder or file row from the tree.
   *
   * @param row Metadata of the row to remove.
   */
  protected onDelete(row: FlatRowData): void {
    if (this.store.editingId() === row.id) {
      this.store.cancelRename();
    }
    this.store.deleteNode(row.id);
    this.sessions.set(this.store.sessions());
    this.selectedFileId.set(this.store.selectedFileId());
  }

  // ---------------------------------------------------------------------------
  // Move-to picker
  // ---------------------------------------------------------------------------

  /**
   * Opens the destination folder selector popover menu.
   *
   * @param row The row model to relocate.
   * @param event The mouse click event.
   */
  protected openMovePicker(row: FlatRowData, event: Event): void {
    this.movePicker()?.open(row, event);
  }

  /**
   * Triggered upon confirming destination target inside the move popover dialog.
   *
   * @param request Payload containing source ID and target host ID.
   */
  protected onMoveConfirmed({
    sourceId,
    targetFolderId,
  }: MoveFolderRequest): void {
    this.store.moveNode(sourceId, targetFolderId, 0);
    if (targetFolderId) {
      this.store.expandFolder(targetFolderId);
    }
    this.sessions.set(this.store.sessions());
  }
}
