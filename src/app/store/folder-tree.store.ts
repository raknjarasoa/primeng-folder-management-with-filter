import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, forkJoin } from 'rxjs';
import { TreeNode } from 'primeng/api';

import {
  NodeData,
  SessionNode,
  ViewMeta,
} from '../models/folder-tree.models';
import { FolderApiService } from '../services/folder-api.service';
import {
  insertNode,
  isAncestorOrSelf,
  removeNode,
  renameFolder,
} from './tree-helpers';

// ----------------------------------------------------------------------------
// State shape
// ----------------------------------------------------------------------------
type State = {
  /** Persisted tree structure — source of truth for hierarchy. */
  sessions: SessionNode[];
  /** Flat view metadata, keyed by id for O(1) lookup during projection. */
  viewsById: Record<string, ViewMeta>;
  loading: boolean;
  error: string | null;
};

const initialState: State = {
  sessions: [],
  viewsById: {},
  loading: false,
  error: null,
};

// ----------------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------------
export const FolderTreeStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  /**
   * `treeNodes` is the read-only projection consumed by the component.
   * It joins sessions (hierarchy) with viewsById (file metadata).
   */
  withComputed(({ sessions, viewsById }) => ({
    treeNodes: computed<TreeNode<NodeData>[]>(() =>
      toTreeNodes(sessions(), viewsById()),
    ),
  })),

  withMethods((store, api = inject(FolderApiService)) => ({
    /** Load both endpoints in parallel and join into store state. */
    load: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          forkJoin({
            sessions: api.fetchSessions(),
            views: api.fetchViews(),
          }).pipe(
            tap({
              next: ({ sessions, views }) => {
                const viewsById = Object.fromEntries(
                  views.map((v) => [v.id, v]),
                );
                patchState(store, { sessions, viewsById, loading: false });
              },
              error: (err) =>
                patchState(store, {
                  loading: false,
                  error: err?.message ?? 'Failed to load folder tree',
                }),
            }),
          ),
        ),
      ),
    ),

    /**
     * Move a node into a folder (or root if `targetFolderId` is null).
     * `index` is the final destination position in the target's child list.
     */
    moveNode(
      draggedId: string,
      targetFolderId: string | null,
      index?: number,
    ): void {
      const current = store.sessions();

      // Cycle prevention: dropping a folder into itself or a descendant.
      if (
        targetFolderId !== null &&
        isAncestorOrSelf(current, draggedId, targetFolderId)
      ) {
        return;
      }

      const { forest: without, removed } = removeNode(current, draggedId);
      if (!removed) return;

      const next = insertNode(without, removed, targetFolderId, index);
      patchState(store, { sessions: next });
    },

    /** Delete a node (folder or file) by id. */
    deleteNode(id: string): void {
      const { forest } = removeNode(store.sessions(), id);
      patchState(store, { sessions: forest });
    },

    /** Rename a folder. Files are not renamable here (they derive from views). */
    renameFolder(id: string, newName: string): void {
      const trimmed = newName.trim();
      if (!trimmed) return;
      patchState(store, {
        sessions: renameFolder(store.sessions(), id, trimmed),
      });
    },
  })),

  withHooks({
    onInit(store) {
      store.load();
    },
  }),
);

// ----------------------------------------------------------------------------
// Projection: SessionNode[] + viewsById -> PrimeNG TreeNode[]
// ----------------------------------------------------------------------------
function toTreeNodes(
  sessions: SessionNode[],
  viewsById: Record<string, ViewMeta>,
): TreeNode<NodeData>[] {
  return sessions.map((s) => sessionToTreeNode(s, viewsById));
}

function sessionToTreeNode(
  s: SessionNode,
  viewsById: Record<string, ViewMeta>,
): TreeNode<NodeData> {
  if (s.kind === 'folder') {
    return {
      key: s.id,
      label: s.name ?? '(untitled folder)',
      icon: 'pi pi-folder',
      droppable: true,
      draggable: true,
      // Empty folder still needs `children: []` so PrimeNG accepts drops into it.
      children: (s.children ?? []).map((c) => sessionToTreeNode(c, viewsById)),
      data: { id: s.id, kind: 'folder' },
    };
  }
  // File: pull joined metadata; gracefully degrade if a view is missing.
  const view = viewsById[s.id];
  return {
    key: s.id,
    label: view?.name ?? `(missing view: ${s.id})`,
    icon: 'pi pi-file',
    droppable: false, // files cannot receive drops
    draggable: true,
    leaf: true,
    data: { id: s.id, kind: 'file', view },
  };
}
