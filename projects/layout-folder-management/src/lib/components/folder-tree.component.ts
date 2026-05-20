import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  CdkDrag,
  CdkDragMove,
  CdkDragRelease,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { FolderTreeStore } from '../store/folder-tree.store';
import {
  FlatRow,
  LayoutInstance,
  SessionNode,
} from '../models/folder-tree.models';
import {
  OTHERS_ROOT_ID,
  collectSubtreeIds,
  flattenSessions,
} from '../store/tree-helpers';

type DropZone = 'before' | 'into' | 'after';
interface DropTarget {
  rowIndex: number;
  zone: DropZone;
}

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    ScrollingModule,
    CdkDrag,
    CdkDropList,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TooltipModule,
    ConfirmDialogModule,
  ],
  providers: [FolderTreeStore, ConfirmationService],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  // ---------------------------------------------------------------------------
  // Inputs / outputs
  // ---------------------------------------------------------------------------

  sessions = model.required<SessionNode[]>();
  layouts = input<LayoutInstance[]>([]);
  selectedFileId = model.required<string | null>();

  // Must match the row CSS height. CDK virtual scroll places rows by index *
  // ROW_HEIGHT; if these diverge you'll see overlap or gaps.
  protected readonly ROW_HEIGHT = 28;
  protected readonly INDENT_PX = 16;

  protected readonly store = inject(FolderTreeStore);
  protected readonly confirmationService = inject(ConfirmationService);

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------

  protected readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  protected readonly creatingId = signal<string | null>(null);

  protected readonly filterText = signal<string>('');
  protected readonly debouncedFilterText = toSignal(
    toObservable(this.filterText).pipe(debounceTime(300)),
    { initialValue: '' },
  );
  protected readonly isFiltering = computed(
    () => this.debouncedFilterText().trim().length > 0,
  );

  // Active drag-drop target indicator (rendered as a blue line / highlight).
  protected readonly dropTarget = signal<DropTarget | null>(null);

  // ---------------------------------------------------------------------------
  // Derived rows
  // ---------------------------------------------------------------------------

  protected readonly flatRows = computed<FlatRow[]>(() =>
    flattenSessions(
      this.store.sessions(),
      this.store.layoutsById(),
      this.expandedIds(),
      this.debouncedFilterText().trim(),
    ),
  );

  private readonly viewport = viewChild(CdkVirtualScrollViewport);

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

  // ---------------------------------------------------------------------------
  // Lifecycle effects
  // ---------------------------------------------------------------------------

  // Tracks which selection id we've already auto-expanded ancestors for. Without
  // it the effect below would re-expand on every unrelated recompute (e.g.
  // sessions change), undoing manual collapses the user just made.
  private lastSelectedSeen: string | null | undefined = undefined;

  constructor() {
    // Parent inputs → store
    effect(() => {
      this.store.initData(this.sessions(), this.layouts());
    });

    effect(() => {
      this.store.selectFile(this.selectedFileId());
    });

    // Auto-expand ancestors of the selected file on selection changes
    effect(() => {
      const selectedId = this.store.selectedFileId();
      const ancestors = this.store.selectedFileAncestors();
      untracked(() => {
        if (this.lastSelectedSeen === selectedId) return;
        this.lastSelectedSeen = selectedId;
        if (!selectedId || ancestors.length === 0) return;
        this.expandedIds.update((set) => {
          const next = new Set(set);
          for (const a of ancestors) next.add(a);
          return next;
        });
      });
    });

    // Store → parent. The reference-equality guards are load-bearing: without
    // them this effect (writing the model) would re-trigger the input → store
    // effect above and loop forever. `untracked` keeps the model reads outside
    // the dependency set.
    effect(() => {
      const s = this.store.sessions();
      const sel = this.store.selectedFileId();
      untracked(() => {
        if (this.sessions() !== s) this.sessions.set(s);
        if (this.selectedFileId() !== sel) this.selectedFileId.set(sel);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Row interaction
  // ---------------------------------------------------------------------------

  protected onRowClick(row: FlatRow): void {
    if (row.kind === 'file') {
      this.store.selectFile(row.id);
    } else if (row.hasChildren) {
      this.toggleExpand(row.id);
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

  protected trackRowId = (_: number, row: FlatRow): string => row.id;

  // ---------------------------------------------------------------------------
  // Drag and drop — custom hit detection compatible with virtual scroll
  // ---------------------------------------------------------------------------

  protected canDrag(row: FlatRow): boolean {
    return !row.isOther && row.id !== OTHERS_ROOT_ID && !this.isFiltering();
  }

  protected onDragStarted(event: CdkDragStart, sourceRow: FlatRow): void {
    // Snapshot the source id while the template binding is still trustworthy.
    this.draggedRowId = sourceRow.id;
    // Precompute the set of IDs we can't drop into (self + descendants). The
    // drag handler fires on every pointer move, so this avoids walking the
    // tree 60×/second.
    this.dragForbiddenIds = collectSubtreeIds(this.store.sessions(), sourceRow.id);
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

  // We can't rely on cdkDropList's built-in hit testing: virtual scroll keeps
  // only the visible window in the DOM, so off-screen targets simply don't
  // exist as drop zones. Instead we resolve the target row from the pointer's
  // Y position + the viewport's scroll offset, then map that to an index in
  // flatRows.
  protected onDragMoved(event: CdkDragMove, sourceRow: FlatRow): void {
    const vp = this.viewport();
    if (!vp) return;

    const rect = vp.elementRef.nativeElement.getBoundingClientRect();
    const scrollOffset = vp.measureScrollOffset();

    const pointerYInViewport = event.pointerPosition.y - rect.top;
    if (pointerYInViewport < 0 || pointerYInViewport > rect.height) {
      this.dropTarget.set(null);
      return;
    }
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

  protected onDragReleased(_event: CdkDragRelease, _sourceRow: FlatRow): void {
    const target = this.dropTarget();
    const sourceId = this.draggedRowId;
    this.dropTarget.set(null);
    this.dragForbiddenIds = new Set();
    this.draggedRowId = null;
    if (!target || !sourceId) return;

    const rows = this.flatRows();
    const { parentId, index } = this.resolveDropTarget(rows, target, sourceId);
    this.store.moveNode(sourceId, parentId, index);
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

  // Translates a (target row, zone) hit into the (parentId, insert index)
  // shape that store.moveNode expects. The source is excluded from the
  // sibling count because moveNode removes it before inserting — otherwise
  // same-parent downward drags would land one slot too far.
  private resolveDropTarget(
    rows: FlatRow[],
    target: DropTarget,
    sourceId: string,
  ): { parentId: string | null; index: number } {
    const targetRow = rows[target.rowIndex];

    if (target.zone === 'into') {
      return { parentId: targetRow.id, index: 0 };
    }

    let parentId: string | null = null;
    let siblingsBefore = 0;
    for (let i = target.rowIndex - 1; i >= 0; i--) {
      const row = rows[i];
      if (row.depth < targetRow.depth) {
        parentId = row.id;
        break;
      }
      if (row.depth === targetRow.depth && row.id !== sourceId) siblingsBefore++;
    }

    return {
      parentId,
      index: target.zone === 'before' ? siblingsBefore : siblingsBefore + 1,
    };
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

  protected onAddFolder(parentId: string | null = null): void {
    const newId = this.store.addFolder(parentId, '');
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

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue().trim();
    if (this.editingId() !== id || !value) return;

    // Duplicate-name check against same-depth siblings within parent
    const rows = this.flatRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const target = rows[idx];
      const siblings: FlatRow[] = [];
      for (let i = idx + 1; i < rows.length && rows[i].depth >= target.depth; i++) {
        if (rows[i].depth === target.depth) siblings.push(rows[i]);
      }
      for (let i = idx - 1; i >= 0 && rows[i].depth >= target.depth; i--) {
        if (rows[i].depth === target.depth) siblings.push(rows[i]);
      }
      const duplicate = siblings.some(
        (s) => s.id !== id && s.label.toLowerCase() === value.toLowerCase(),
      );
      if (duplicate) {
        this.confirmationService.confirm({
          message: 'A file or folder with this name already exists at this location.',
          header: 'Duplicate Name',
          icon: 'fas fa-triangle-exclamation',
          rejectVisible: false,
          acceptLabel: 'OK',
        });
        return;
      }
    }

    this.store.renameFolder(id, value);
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected cancelRename(id?: string): void {
    const targetId = id ?? this.editingId();
    if (targetId && targetId === this.creatingId()) {
      this.store.deleteNode(targetId);
    }
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected onDelete(row: FlatRow): void {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this item?',
      header: 'Confirm Deletion',
      icon: 'fas fa-circle-info',
      acceptButtonStyleClass: 'p-button-danger p-button-text',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        if (this.editingId() === row.id) {
          this.editingId.set(null);
          this.creatingId.set(null);
        }
        this.store.deleteNode(row.id);
      },
    });
  }
}
