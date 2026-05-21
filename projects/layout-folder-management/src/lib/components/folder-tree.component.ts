import {
  CdkDrag,
  CdkDragMove,
  CdkDragRelease,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AutoFocus } from 'primeng/autofocus';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime } from 'rxjs/operators';

import {
  FlatRowData,
  TreeItem,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import {
  OrphanGroups,
  OTHERS_ROOT_ID,
  addFolder,
  collectAncestorIds,
  collectSessionFileIds,
  collectSubtreeIds,
  flattenSessions,
  groupOrphanLayouts,
  insertNode,
  isAncestorOrSelf,
  removeNode,
  renameFolder,
} from '../store/tree-helpers';
import {
  MoveFolderPickerComponent,
  MoveFolderRequest,
} from './move-folder-picker.component';

type DropZone = 'before' | 'into' | 'after';
type DropTarget = {
  rowIndex: number;
  zone: DropZone;
};

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ScrollingModule,
    CdkDrag,
    CdkDropList,
    AutoFocus,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TooltipModule,
    MoveFolderPickerComponent,
  ],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  // ---------------------------------------------------------------------------
  // Inputs / outputs
  // ---------------------------------------------------------------------------

  sessions = model.required<TreeItem[]>();
  layouts = input<LayoutInstance[]>([]);
  selectedFileId = model.required<string | null>();

  // Fires on every file-row click, including re-clicks of the currently
  // selected file (where `selectedFileId` would not emit because the value
  // didn't change).
  fileSelected = output<string>();

  // Must match the row CSS height. CDK virtual scroll places rows by index *
  // ROW_HEIGHT; if these diverge you'll see overlap or gaps.
  protected readonly ROW_HEIGHT = 28;
  protected readonly INDENT_PX = 16;

  // Auto-scroll tuning while dragging. The trigger zone is the strip near
  // each edge of the viewport that, when the pointer enters it, kicks off
  // the rAF scroll loop. Speed ramps linearly from min (outer boundary) to
  // max (right at the edge) so the user can throttle by hovering closer or
  // further from the edge.
  private readonly AUTO_SCROLL_ZONE_PX = 60;
  private readonly AUTO_SCROLL_MIN_SPEED = 3;
  private readonly AUTO_SCROLL_MAX_SPEED = 40;

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

  // Tracks layout ids we've deleted locally so they don't reappear under
  // "Others" while the parent's `layouts` input still contains them. Resets
  // automatically when the parent emits a new layouts array.
  private readonly suppressedLayoutIds = linkedSignal<LayoutInstance[], ReadonlySet<string>>({
    source: this.layouts,
    computation: () => new Set<string>(),
  });

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  private readonly layoutsById = computed<Record<string, LayoutInstance>>(() => {
    const suppressed = this.suppressedLayoutIds();
    const out: Record<string, LayoutInstance> = {};
    for (const l of this.layouts()) {
      if (!suppressed.has(l.id)) out[l.id] = l;
    }
    return out;
  });

  // IDs of folders to expand so the selected file becomes visible. If the
  // selection lives inside the real session tree we return that path; otherwise
  // we return the synthetic "Others" path. The hardcoded ids must stay in sync
  // with the rows produced by flattenSessions in tree-helpers.ts.
  private readonly selectedFileAncestors = computed<string[]>(() => {
    const fileId = this.selectedFileId();
    if (!fileId) return [];

    const sessionPath = collectAncestorIds(this.sessions(), fileId);
    if (sessionPath !== null) return sessionPath;

    const layout = this.layoutsById()[fileId];
    if (layout) {
      const uname = layout.username || 'Unknown User';
      return ['others-root', `others-${uname}`];
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

  private readonly viewport = viewChild(CdkVirtualScrollViewport);
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

  // Auto-scroll scratch — only meaningful between drag start and release.
  // lastPointerY is the most recent viewport-relative Y; the rAF tick uses
  // it to re-resolve the drop target after each scroll step (the pointer
  // itself isn't moving, but the rows under it are).
  private autoScrollRafId: number | null = null;
  private autoScrollVelocity = 0;
  private lastPointerY = 0;

  // ---------------------------------------------------------------------------
  // Lifecycle effects
  // ---------------------------------------------------------------------------

  // Tracks which selection id we've already auto-expanded ancestors for.
  // Without it the effect below would re-expand on every unrelated recompute
  // (e.g. sessions change), undoing manual collapses the user just made.
  private lastSelectedSeen: string | null | undefined = undefined;

  constructor() {
    // Auto-expand ancestors of the selected file whenever the selection itself
    // changes (not on every dependent recompute — see lastSelectedSeen).
    effect(() => {
      const selectedId = this.selectedFileId();
      const ancestors = this.selectedFileAncestors();
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

    // Keep the cdk-virtual-scroll viewport in sync with its container size.
    // The hidden→visible transition that happens when this component lives
    // inside an overlay (e.g. <p-popover>) isn't always caught by CDK's own
    // resize observation, so we attach one here that calls checkViewportSize
    // on every resize. Initial measurement runs once via afterNextRender.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const vp = this.viewport();
      if (!vp) return;
      vp.checkViewportSize();
      const observer = new ResizeObserver(() => vp.checkViewportSize());
      observer.observe(vp.elementRef.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
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

  protected onDragStarted(event: CdkDragStart, sourceRow: FlatRowData): void {
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

  // We can't rely on cdkDropList's built-in hit testing: virtual scroll keeps
  // only the visible window in the DOM, so off-screen targets simply don't
  // exist as drop zones. Instead we resolve the target row from the pointer's
  // Y position + the viewport's scroll offset, then map that to an index in
  // flatRows.
  protected onDragMoved(event: CdkDragMove, sourceRow: FlatRowData): void {
    const vp = this.viewport();
    if (!vp) return;

    const rect = vp.elementRef.nativeElement.getBoundingClientRect();
    const pointerYInViewport = event.pointerPosition.y - rect.top;
    if (pointerYInViewport < 0 || pointerYInViewport > rect.height) {
      this.dropTarget.set(null);
      this.setAutoScrollVelocity(0);
      return;
    }

    this.lastPointerY = pointerYInViewport;
    this.recomputeDropTargetAtPointerY(pointerYInViewport);

    // Auto-scroll: speed ramps toward MAX as the pointer nears the edge.
    const distFromTop = pointerYInViewport;
    const distFromBottom = rect.height - pointerYInViewport;
    let velocity = 0;
    if (distFromTop < this.AUTO_SCROLL_ZONE_PX) {
      velocity = -this.scrollSpeedFor(distFromTop);
    } else if (distFromBottom < this.AUTO_SCROLL_ZONE_PX) {
      velocity = this.scrollSpeedFor(distFromBottom);
    }
    this.setAutoScrollVelocity(velocity);
  }

  // Pulled out of onDragMoved so the rAF auto-scroll tick can re-resolve the
  // drop target without a fresh CdkDragMove event (the pointer hasn't moved,
  // but the rows under it have).
  private recomputeDropTargetAtPointerY(pointerYInViewport: number): void {
    const vp = this.viewport();
    if (!vp) return;
    const scrollOffset = vp.measureScrollOffset();
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

  private scrollSpeedFor(distToEdge: number): number {
    const clamped = Math.max(0, Math.min(this.AUTO_SCROLL_ZONE_PX, distToEdge));
    // 0 at outer edge of zone → 1 right at the viewport edge.
    const t = 1 - clamped / this.AUTO_SCROLL_ZONE_PX;
    return (
      this.AUTO_SCROLL_MIN_SPEED +
      (this.AUTO_SCROLL_MAX_SPEED - this.AUTO_SCROLL_MIN_SPEED) * t
    );
  }

  private setAutoScrollVelocity(v: number): void {
    this.autoScrollVelocity = v;
    if (v === 0) {
      this.stopAutoScroll();
    } else if (this.autoScrollRafId === null) {
      this.autoScrollRafId = requestAnimationFrame(() => this.autoScrollTick());
    }
  }

  private autoScrollTick(): void {
    this.autoScrollRafId = null;
    const vp = this.viewport();
    if (!vp || this.autoScrollVelocity === 0) return;

    const currentOffset = vp.measureScrollOffset();
    const nextOffset = Math.max(0, currentOffset + this.autoScrollVelocity);
    vp.scrollToOffset(nextOffset, 'auto');

    this.recomputeDropTargetAtPointerY(this.lastPointerY);

    // Keep looping until onDragMoved or onDragReleased zeros the velocity.
    this.autoScrollRafId = requestAnimationFrame(() => this.autoScrollTick());
  }

  private stopAutoScroll(): void {
    if (this.autoScrollRafId !== null) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
  }

  protected onDragReleased(_event: CdkDragRelease, _sourceRow: FlatRowData): void {
    this.stopAutoScroll();
    this.autoScrollVelocity = 0;
    const target = this.dropTarget();
    const sourceId = this.draggedRowId;
    this.dropTarget.set(null);
    this.dragForbiddenIds = new Set();
    this.draggedRowId = null;
    if (!target || !sourceId) return;

    const rows = this.flatRows();
    const { parentId, index } = this.resolveDropTarget(rows, target, sourceId);
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

  // Translates a (target row, zone) hit into the (parentId, insert index)
  // shape that moveNode expects. The source is excluded from the sibling count
  // because moveNode removes it before inserting — otherwise same-parent
  // downward drags would land one slot too far.
  private resolveDropTarget(
    rows: FlatRowData[],
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

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue().trim();
    if (this.editingId() !== id || !value) return;

    this.sessions.set(renameFolder(this.sessions(), id, value));
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected cancelRename(): void {
    const targetId = this.editingId();
    if (targetId && targetId === this.creatingId()) {
      this.deleteNode(targetId);
    }
    this.editingId.set(null);
    this.creatingId.set(null);
  }

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

  protected openMovePicker(row: FlatRowData, event: Event): void {
    this.movePicker()?.open(row, event);
  }

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

  private moveNode(draggedId: string, targetFolderId: string | null, index?: number): void {
    const current = this.sessions();
    // Reject drops that would create a cycle. The drag UI already filters
    // these, but we guard here too against programmatic misuse.
    if (targetFolderId !== null && isAncestorOrSelf(current, draggedId, targetFolderId)) return;
    const { forest: without, removed } = removeNode(current, draggedId);
    if (!removed) return;
    this.sessions.set(insertNode(without, removed, targetFolderId, index));
  }

  private deleteNode(id: string): void {
    const { forest } = removeNode(this.sessions(), id);
    this.sessions.set(forest);
    // Suppress the layout (if any) so it doesn't migrate to "Others" while
    // the parent's input still contains it. Harmless for folder ids — they
    // never match a layout.
    this.suppressedLayoutIds.update((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
    if (this.selectedFileId() === id) this.selectedFileId.set(null);
  }
}
