import { effect, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { computed } from '@angular/core';
import { debounceTime } from 'rxjs/operators';

import { FlatRowData, TreeItem } from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import {
  DropTarget,
  addFolder,
  collectAncestorIds,
  collectSessionFileIds,
  flattenSessions,
  groupOrphanLayouts,
  insertNode,
  isAncestorOrSelf,
  removeNode,
  renameFolder,
  resolveDropTarget,
} from './tree-helpers';

/**
 * Declares the initial state shape for the Folder Tree Store.
 */
const initialFolderTreeState = {
  sessions: [] as TreeItem[],
  layouts: [] as LayoutInstance[],
  selectedFileId: null as string | null,
  filterText: '',
  _debouncedFilterText: '',
  editingId: null as string | null,
  editingValue: '',
  creatingId: null as string | null,
  expandedIds: new Set<string>() as ReadonlySet<string>,
  dropTarget: null as DropTarget | null,
  focusedRowId: null as string | null,
};

/**
 * A highly encapsulated, reactive NgRx Signal Store managing all states,
 * derived computed projections, and immutable structural mutations for the folder tree.
 */
export const FolderTreeStore = signalStore(
  withState(initialFolderTreeState),

  withComputed((store) => {
    const _layoutsById = computed(() => {
      const out: Record<string, LayoutInstance> = {};
      for (const l of store.layouts()) {
        out[l.id] = l;
      }
      return out;
    });

    const _selectedFileAncestors = computed(() => {
      const fileId = store.selectedFileId();
      if (!fileId) return [];

      const sessionPath = collectAncestorIds(store.sessions(), fileId);
      if (sessionPath !== null) return sessionPath;

      const layout = _layoutsById()[fileId];
      if (layout) {
        const uname = layout.username || 'Unknown User';
        return ['virtual-others-root', `virtual-user-${uname}`];
      }

      return [];
    });

    const _orphanGroups = computed(() => {
      const fileIds = collectSessionFileIds(store.sessions());
      return groupOrphanLayouts(_layoutsById(), fileIds);
    });

    const flatRows = computed(() =>
      flattenSessions(
        store.sessions(),
        _layoutsById(),
        _orphanGroups(),
        store.expandedIds(),
        store._debouncedFilterText(),
      )
    );

    const isFiltering = computed(() => store._debouncedFilterText().trim().length > 0);

    return {
      _layoutsById,
      _selectedFileAncestors,
      _orphanGroups,
      flatRows,
      isFiltering,
    };
  }),

  withMethods((store) => ({
    setSessions(sessions: TreeItem[]): void {
      patchState(store, { sessions });
    },

    setLayouts(layouts: LayoutInstance[]): void {
      patchState(store, { layouts });
    },

    setSelectedFileId(selectedFileId: string | null): void {
      patchState(store, { selectedFileId });
    },

    updateFilterText(filterText: string): void {
      patchState(store, { filterText });
    },

    _updateDebouncedFilterText(debouncedFilterText: string): void {
      patchState(store, { _debouncedFilterText: debouncedFilterText });
    },

    setDropTarget(dropTarget: DropTarget | null): void {
      patchState(store, { dropTarget });
    },

    setEditingId(editingId: string | null): void {
      patchState(store, { editingId });
    },

    setEditingValue(editingValue: string): void {
      patchState(store, { editingValue });
    },

    setCreatingId(creatingId: string | null): void {
      patchState(store, { creatingId });
    },

    setFocusedRowId(focusedRowId: string | null): void {
      patchState(store, { focusedRowId });
    },

    setExpandedIds(expandedIds: ReadonlySet<string>): void {
      patchState(store, { expandedIds });
    },

    toggleExpand(id: string): void {
      patchState(store, (state) => {
        const next = new Set(state.expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { expandedIds: next };
      });
    },

    expandFolder(id: string): void {
      patchState(store, (state) => {
        if (state.expandedIds.has(id)) return {};
        const next = new Set(state.expandedIds);
        next.add(id);
        return { expandedIds: next };
      });
    },

    collapseFolder(id: string): void {
      patchState(store, (state) => {
        if (!state.expandedIds.has(id)) return {};
        const next = new Set(state.expandedIds);
        next.delete(id);
        return { expandedIds: next };
      });
    },

    addFolder(parentId: string | null): void {
      const { forest, newId } = addFolder(store.sessions(), parentId, '');
      patchState(store, (state) => {
        const nextExpanded = new Set(state.expandedIds);
        if (parentId) nextExpanded.add(parentId);
        return {
          sessions: forest,
          creatingId: newId,
          editingId: newId,
          editingValue: '',
          expandedIds: nextExpanded,
        };
      });
    },

    startRename(id: string, currentLabel: string): void {
      patchState(store, { editingId: id, editingValue: currentLabel });
    },

    updateEditingValue(value: string): void {
      patchState(store, { editingValue: value });
    },

    commitRename(id: string): void {
      const value = store.editingValue().trim();
      if (store.editingId() !== id || !value) return;

      const nextForest = renameFolder(store.sessions(), id, value);
      patchState(store, {
        sessions: nextForest,
        editingId: null,
        creatingId: null,
      });
    },

    cancelRename(): void {
      const targetId = store.editingId();
      if (targetId && targetId === store.creatingId()) {
        this.deleteNode(targetId);
      }
      patchState(store, { editingId: null, creatingId: null });
    },

    deleteNode(id: string): void {
      const { forest } = removeNode(store.sessions(), id);
      const nextSelected = store.selectedFileId() === id ? null : store.selectedFileId();
      patchState(store, {
        sessions: forest,
        selectedFileId: nextSelected,
      });
    },

    moveNode(draggedId: string, targetFolderId: string | null, index?: number): void {
      const current = store.sessions();
      if (targetFolderId !== null && isAncestorOrSelf(current, draggedId, targetFolderId)) return;
      const { forest: without, removed } = removeNode(current, draggedId);
      if (!removed) return;
      const nextForest = insertNode(without, removed, targetFolderId, index);
      patchState(store, { sessions: nextForest });
    },

    completeDragDrop(sourceId: string): void {
      const target = store.dropTarget();
      patchState(store, { dropTarget: null });

      if (!target) return;

      const rows = store.flatRows();
      const { parentId, index } = resolveDropTarget(rows, target, sourceId);

      this.moveNode(sourceId, parentId, index);

      if (parentId) {
        patchState(store, (state) => {
          if (state.expandedIds.has(parentId)) return {};
          const next = new Set(state.expandedIds);
          next.add(parentId);
          return { expandedIds: next };
        });
      }
    },
  })),

  withHooks({
    onInit(store) {
      // Auto-expand ancestors of the selected file whenever the selection changes.
      effect(() => {
        const selectedId = store.selectedFileId();
        if (!selectedId) return;

        // Auto focus the selected item
        untracked(() => {
          if (store.focusedRowId() !== selectedId) {
            patchState(store, { focusedRowId: selectedId });
          }
        });

        const ancestors = store._selectedFileAncestors();
        if (ancestors.length === 0) return;
        patchState(store, (state) => {
          const next = new Set(state.expandedIds);
          let changed = false;
          for (const a of ancestors) {
            if (!next.has(a)) {
              next.add(a);
              changed = true;
            }
          }
          return changed ? { expandedIds: next } : {};
        });
      });

      // Handle search text debouncing reactively
      toObservable(store.filterText)
        .pipe(
          debounceTime(300),
          takeUntilDestroyed()
        )
        .subscribe((debouncedValue) => {
          patchState(store, { _debouncedFilterText: debouncedValue });
        });
    },
  })
);

export type FolderTreeStore = InstanceType<typeof FolderTreeStore>;
