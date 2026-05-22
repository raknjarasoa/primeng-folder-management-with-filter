import { SelectionModel } from '@angular/cdk/collections';
import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { CdkTreeModule } from '@angular/cdk/tree';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  untracked,
  viewChild,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoFocus } from 'primeng/autofocus';

import { FlatRowData, TreeItem } from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import { FolderTreeStore } from '../store/folder-tree.store';
import {
  collectSubtreeIds,
  DropTarget,
  DropZone,
  OTHERS_ROOT_ID,
} from '../store/tree-helpers';
import {
  MoveFolderPickerComponent,
  MoveFolderRequest,
} from './move-folder-picker.component';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FolderTreeStore],
  imports: [
    FormsModule,
    CdkDrag,
    CdkDropList,
    CdkTreeModule,
    AutoFocus,
    MoveFolderPickerComponent,
  ],
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

  protected readonly levelAccessor = (node: FlatRowData) => node.depth;
  protected readonly expansionKey = (node: FlatRowData) => node.id;

  private readonly viewport: Signal<ElementRef<HTMLElement> | undefined> = viewChild('viewport', {
    read: ElementRef,
  });
  private readonly movePicker = viewChild<MoveFolderPickerComponent>('movePicker');

  protected readonly fileSelection = new SelectionModel<string>(false);

  // ---------------------------------------------------------------------------
  // Drag scratch state — captured at drag start, consumed on move / release.
  // ---------------------------------------------------------------------------
  private dragForbiddenIds: Set<string> = new Set();
  private draggedRowId: string | null = null;
  private lastPointerYInViewport: number | null = null;
  private viewportRect: DOMRect | null = null;

  // ---------------------------------------------------------------------------
  // Backward compatibility getters for unit tests
  // ---------------------------------------------------------------------------

  private createStoreSignalWrapper<T>(getter: () => T, updater: (value: T) => void) {
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
      (v) => this.store.updateFilterText(v)
    );
  }

  protected get editingId() {
    return this.createStoreSignalWrapper(
      () => this.store.editingId(),
      (v) => this.store.setEditingId(v)
    );
  }

  protected get editingValue() {
    return this.createStoreSignalWrapper(
      () => this.store.editingValue(),
      (v) => this.store.setEditingValue(v)
    );
  }

  protected get creatingId() {
    return this.createStoreSignalWrapper(
      () => this.store.creatingId(),
      (v) => this.store.setCreatingId(v)
    );
  }

  protected get expandedIds() {
    return this.createStoreSignalWrapper(
      () => this.store.expandedIds(),
      (v) => this.store.setExpandedIds(v)
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
      (v) => this.store.setDropTarget(v)
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
      const val = this.selectedFileId();
      untracked(() => {
        if (val) {
          this.fileSelection.select(val);
        } else {
          this.fileSelection.clear();
        }
        this.store.setSelectedFileId(val);
      });
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
        if (storeSelectedId) {
          this.fileSelection.select(storeSelectedId);
        } else {
          this.fileSelection.clear();
        }
        if (this.selectedFileId() !== storeSelectedId) {
          this.selectedFileId.set(storeSelectedId);
        }
      });
    });

    // Sync fileSelection changes back to selectedFileId signal model and store
    this.fileSelection.changed.subscribe(change => {
      const selectedId = change.source.selected[0] || null;
      if (this.selectedFileId() !== selectedId) {
        this.selectedFileId.set(selectedId);
      }
      if (this.store.selectedFileId() !== selectedId) {
        this.store.setSelectedFileId(selectedId);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Row interaction
  // ---------------------------------------------------------------------------

  protected onRowClick(row: FlatRowData): void {
    if (row.kind === 'file') {
      this.fileSelection.select(row.id);
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
    return !row.isOther && row.id !== OTHERS_ROOT_ID && !this.store.isFiltering();
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

    const element = vp.nativeElement;
    
    // Clamp the pointer coordinate to valid viewport bounds [0, height - 1] to keep drop targets active at the boundaries
    const rect = this.viewportRect;
    const viewportHeight = rect ? rect.height : element.clientHeight;
    const clampedPointerY = Math.max(0, Math.min(viewportHeight - 1, pointerYInViewport));

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
    this.lastPointerYInViewport = null;
    this.viewportRect = null;
    this.draggedRowId = null;
    this.dragForbiddenIds = new Set();
    this.store.completeDragDrop(sourceId);
    this.sessions.set(this.store.sessions());
  }

  /**
   * Fired when a CDK drag session begins. Initializes tracking bounds, prevents self-loops.
   * 
   * @param event The CDK drag start event.
   * @param sourceRow The metadata of the item being dragged.
   */
  protected onDragStarted(event: CdkDragStart, sourceRow: FlatRowData): void {
    if (this.draggedRowId !== null) {
      this.completePendingDrag(this.draggedRowId);
    }
    const vp = this.viewport();
    if (vp) {
      this.viewportRect = vp.nativeElement.getBoundingClientRect();
    }
    this.draggedRowId = sourceRow.id;
    this.dragForbiddenIds = collectSubtreeIds(this.store.sessions(), sourceRow.id);
    if (sourceRow.kind === 'folder' && this.store.expandedIds().has(sourceRow.id)) {
      this.store.collapseFolder(sourceRow.id);
    }
  }

  /**
   * Fired continually during the drag move lifecycle.
   * 
   * @param event The CDK drag move event.
   * @param sourceRow The row metadata being dragged.
   */
  protected onDragMoved(event: CdkDragMove, sourceRow: FlatRowData): void {
    const rect = this.viewportRect;
    if (!rect) return;

    const pointerYInViewport = event.pointerPosition.y - rect.top;
    
    // If the pointer goes completely out of bounds (exceeding a generous 30px buffer),
    // we clear the drop target.
    const OUT_OF_BOUNDS_BUFFER = 30;
    if (pointerYInViewport < -OUT_OF_BOUNDS_BUFFER || pointerYInViewport > rect.height + OUT_OF_BOUNDS_BUFFER) {
      this.store.setDropTarget(null);
      return;
    }

    this.lastPointerYInViewport = pointerYInViewport;
    this.recomputeDropTargetAtPointerY(pointerYInViewport);
  }

  /**
   * Fired when the drag drops or finishes.
   * 
   * @param event The CDK drag end event.
   * @param sourceRow The row metadata that was dragged.
   */
  protected onDragEnded(event: CdkDragEnd, sourceRow: FlatRowData): void {
    if (sourceRow.id === this.draggedRowId) {
      this.completePendingDrag(sourceRow.id);
    }
  }

  /**
   * Fired when the viewport container scrolls. Updates drop zone logic
   * while dragging.
   */
  protected onViewportScroll(event: Event): void {
    if (this.draggedRowId !== null && this.lastPointerYInViewport !== null) {
      this.recomputeDropTargetAtPointerY(this.lastPointerYInViewport);
    }
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
  protected onMoveConfirmed({ sourceId, targetFolderId }: MoveFolderRequest): void {
    this.store.moveNode(sourceId, targetFolderId, 0);
    if (targetFolderId) {
      this.store.expandFolder(targetFolderId);
    }
    this.sessions.set(this.store.sessions());
  }
}
