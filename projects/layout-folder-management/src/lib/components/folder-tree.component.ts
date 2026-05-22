import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AutoFocus } from 'primeng/autofocus';
import { debounceTime } from 'rxjs/operators';

import {
  FlatRowData,
  TreeItem,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import {
  addFolder,
  collectAncestorIds,
  collectSessionFileIds,
  collectSubtreeIds,
  DropTarget,
  DropZone,
  flattenSessions,
  groupOrphanLayouts,
  insertNode,
  isAncestorOrSelf,
  OrphanGroups,
  OTHERS_ROOT_ID,
  OTHERS_USER_PREFIX,
  removeNode,
  renameFolder,
  resolveDropTarget,
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
  imports: [
    FormsModule,
    CdkDrag,
    CdkDropList,
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

  protected readonly OTHERS_ROOT_ID = OTHERS_ROOT_ID;

  // Must match the row CSS height. CDK virtual scroll places rows by index *
  // ROW_HEIGHT; if these diverge you'll see overlap or gaps.
  protected readonly ROW_HEIGHT = 28;
  protected readonly INDENT_PX = 16;

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------
  protected readonly filterText = signal<string>('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  private readonly creatingId = signal<string | null>(null);
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly debouncedFilterText = toSignal<string, string>(
    toObservable(this.filterText).pipe(debounceTime(300)),
    { initialValue: '' },
  );
  protected readonly isFiltering = computed(
    () => this.debouncedFilterText().trim().length > 0,
  );

  // Active drag-drop target indicator (rendered as a blue line / highlight).
  protected readonly dropTarget = signal<DropTarget | null>(null);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  private readonly layoutsById = computed<Record<string, LayoutInstance>>(() => {
    const out: Record<string, LayoutInstance> = {};
    for (const l of this.layouts()) {
      out[l.id] = l;
    }
    return out;
  });

  // IDs of folders to expand so the selected file becomes visible. If the
  // selection lives inside the real session tree we return that path; otherwise
  // we return the synthetic "Others" path built from the shared constants
  // exported by tree-helpers.ts.
  private readonly selectedFileAncestors = computed<string[]>(() => {
    const fileId = this.selectedFileId();
    if (!fileId) return [];

    const sessionPath = collectAncestorIds(this.sessions(), fileId);
    if (sessionPath !== null) return sessionPath;

    const layout = this.layoutsById()[fileId];
    if (layout) {
      const uname = layout.username || 'Unknown User';
      return [OTHERS_ROOT_ID, `${OTHERS_USER_PREFIX}${uname}`];
    }

    return [];
  });

  // Orphan-layout grouping is hoisted out of `flattenSessions` because it
  // iterates every entry in `layoutsById`. Without this memo, every
  // expand/collapse/filter/selection change would re-walk all layouts, which
  // dominates the change-detection cost (profiled at ~12 ms for the perf
  // dataset). Recomputes only when sessions or layouts change.
  private readonly orphanGroups = computed<OrphanGroups>(() => {
    const fileIds = collectSessionFileIds(this.sessions());
    return groupOrphanLayouts(this.layoutsById(), fileIds);
  });

  protected readonly flatRows = computed<FlatRowData[]>(() =>
    flattenSessions(
      this.sessions(),
      this.layoutsById(),
      this.orphanGroups(),
      this.expandedIds(),
      this.debouncedFilterText().trim(),
    ),
  );

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly movePicker = viewChild<MoveFolderPickerComponent>('movePicker');

  // ---------------------------------------------------------------------------
  // Drag scratch state — captured at drag start, consumed on move / release.
  //
  // draggedRowId is read at release time instead of the handler's `sourceRow`
  // argument: under CDK virtual scroll the source DOM row gets recycled mid-drag
  // (to display another data row), so Angular re-binds `sourceRow` to the wrong
  // node. Snapshotting the id once at drag-start avoids that drift.
  // ---------------------------------------------------------------------------
  private dragForbiddenIds: Set<string> = new Set();
  private draggedRowId: string | null = null;

  private readonly autoscroller = new TreeAutoscroller(
    () => this.viewport()?.nativeElement,
    {
      onScrollTick: (pointerY) => this.recomputeDropTargetAtPointerY(pointerY),
    },
  );

  // ---------------------------------------------------------------------------
  // Lifecycle effects
  // ---------------------------------------------------------------------------

  constructor() {
    // Auto-expand ancestors of the selected file whenever the selection itself changes.
    // By keeping the ancestors lookup inside untracked, we isolate the reactive dependency
    // to selectedFileId and prevent subsequent tree updates from undoing manual collapses.
    effect(() => {
      const selectedId = this.selectedFileId();
      if (!selectedId) return;
      untracked(() => {
        const ancestors = this.selectedFileAncestors();
        if (ancestors.length === 0) return;
        this.expandedIds.update((set) => {
          const next = new Set(set);
          for (const a of ancestors) next.add(a);
          return next;
        });
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
      this.selectedFileId.set(row.id);
      this.fileSelected.emit(row.id);
    } else if (row.hasChildren) {
      // this.toggleExpand(row.id);
    }
  }

  protected toggleExpand(id: string, event?: Event): void {
    event?.stopPropagation();
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected trackRowId = (_: number, row: FlatRowData): string => row.id;

  // ---------------------------------------------------------------------------
  // Drag and drop — custom hit detection compatible with virtual scroll
  // ---------------------------------------------------------------------------

  protected canDrag(row: FlatRowData): boolean {
    return !row.isOther && row.id !== OTHERS_ROOT_ID && !this.isFiltering();
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
    const scrollOffset = element.scrollTop;
    const pointerY = pointerYInViewport + scrollOffset;
    const rowIndex = Math.floor(pointerY / this.ROW_HEIGHT);
    const offsetInRow = pointerY - rowIndex * this.ROW_HEIGHT;

    const rows = this.flatRows();
    if (rowIndex < 0 || rowIndex >= rows.length) {
      this.dropTarget.set(null);
      return;
    }

    const targetRow = rows[rowIndex];
    if (this.dragForbiddenIds.has(targetRow.id) || targetRow.isOther) {
      this.dropTarget.set(null);
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

    const prev = this.dropTarget();
    if (!prev || prev.rowIndex !== rowIndex || prev.zone !== zone) {
      this.dropTarget.set({ rowIndex, zone });
    }
  }

  /**
   * Performs the mutation on structural drop confirmation and stops autoscrolling.
   * 
   * @param sourceId The ID of the item being dropped.
   */
  private completePendingDrag(sourceId: string): void {
    const target = this.dropTarget();
    this.autoscroller.stop();
    this.draggedRowId = null;
    this.dragForbiddenIds = new Set();
    this.dropTarget.set(null);

    if (!target) return;

    const rows = this.flatRows();
    const { parentId, index } = resolveDropTarget(rows, target, sourceId);

    this.moveNode(sourceId, parentId, index);
    // Expand the new parent so the dropped item is visible
    if (parentId) {
      this.expandedIds.update((set) => {
        if (set.has(parentId)) return set;
        const next = new Set(set);
        next.add(parentId);
        return next;
      });
    }
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
      this.autoscroller.start(vp.nativeElement);
    }
    // Snapshot the source id while the template binding is still trustworthy.
    this.draggedRowId = sourceRow.id;
    // Precompute the set of IDs we can't drop into (self + descendants). The
    // drag handler fires on every pointer move, so this avoids walking the
    // tree 60×/second.
    this.dragForbiddenIds = collectSubtreeIds(this.sessions(), sourceRow.id);
    // Collapse the source folder during drag so its descendants aren't visible
    // (visually noisy and they're invalid drop targets anyway).
    if (sourceRow.kind === 'folder' && this.expandedIds().has(sourceRow.id)) {
      this.expandedIds.update((set) => {
        const next = new Set(set);
        next.delete(sourceRow.id);
        return next;
      });
    }
  }

  /**
   * Fired continually during the drag move lifecycle.
   * 
   * @param event The CDK drag move event.
   * @param sourceRow The row metadata being dragged.
   */
  protected onDragMoved(event: CdkDragMove, sourceRow: FlatRowData): void {
    const rect = this.autoscroller.getViewportRect();
    if (!rect) return;

    const pointerYInViewport = event.pointerPosition.y - rect.top;
    if (pointerYInViewport < 0 || pointerYInViewport > rect.height) {
      this.dropTarget.set(null);
      this.autoscroller.stop();
      return;
    }

    this.recomputeDropTargetAtPointerY(pointerYInViewport);
    this.autoscroller.move(pointerYInViewport);
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

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  protected onFilterChange(value: string): void {
    this.filterText.set(value);
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
    const { forest, newId } = addFolder(this.sessions(), parentId, '');
    this.sessions.set(forest);
    if (parentId) {
      this.expandedIds.update((set) => {
        if (set.has(parentId)) return set;
        const next = new Set(set);
        next.add(parentId);
        return next;
      });
    }
    this.creatingId.set(newId);
    this.startRename(newId, '');
  }

  /**
   * Initiates edit mode on a folder's label name.
   * 
   * @param id Unique identifier of the folder to rename.
   * @param currentLabel Current name of the folder.
   */
  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  /**
   * Saves the edit name mutation and leaves edit mode.
   * 
   * @param id The folder being renamed.
   */
  protected commitRename(id: string): void {
    const value = this.editingValue().trim();
    if (this.editingId() !== id || !value) return;

    this.sessions.set(renameFolder(this.sessions(), id, value));
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  /**
   * Cancels any active folder rename session. Removes newly created empty folders.
   */
  protected cancelRename(): void {
    const targetId = this.editingId();
    if (targetId && targetId === this.creatingId()) {
      this.deleteNode(targetId);
    }
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  /**
   * Handles the text input blur event when renaming a folder.
   * 
   * @param id Unique folder ID.
   */
  protected onRenameInputBlur(id: string): void {
    const value = this.editingValue().trim();
    if (value) {
      this.commitRename(id);
    } else {
      this.cancelRename();
    }
  }

  /**
   * Deletes a folder or file row from the tree.
   * 
   * @param row Metadata of the row to remove.
   */
  protected onDelete(row: FlatRowData): void {
    if (this.editingId() === row.id) {
      this.editingId.set(null);
      this.creatingId.set(null);
    }
    this.deleteNode(row.id);
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
    this.moveNode(sourceId, targetFolderId, 0);
    if (targetFolderId) {
      this.expandedIds.update((set) => {
        if (set.has(targetFolderId)) return set;
        const next = new Set(set);
        next.add(targetFolderId);
        return next;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Tree mutations — all immutable, just orchestrations over tree-helpers.
  // ---------------------------------------------------------------------------

  /**
   * Immutably processes structural moving operations in the directory model.
   * 
   * @param draggedId The ID of the item being moved.
   * @param targetFolderId The parent folder ID target, or null for root level.
   * @param index Insertion sibling index.
   */
  private moveNode(draggedId: string, targetFolderId: string | null, index?: number): void {
    const current = this.sessions();
    // Reject drops that would create a cycle. The drag UI already filters
    // these, but we guard here too against programmatic misuse.
    if (targetFolderId !== null && isAncestorOrSelf(current, draggedId, targetFolderId)) return;
    const { forest: without, removed } = removeNode(current, draggedId);
    if (!removed) return;
    this.sessions.set(insertNode(without, removed, targetFolderId, index));
  }

  /**
   * Immutably processes node deletions.
   * 
   * @param id Unique folder or file ID to remove.
   */
  private deleteNode(id: string): void {
    const { forest } = removeNode(this.sessions(), id);
    this.sessions.set(forest);
    if (this.selectedFileId() === id) this.selectedFileId.set(null);
  }
}
