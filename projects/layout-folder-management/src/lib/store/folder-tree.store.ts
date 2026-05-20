import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

import { LayoutInstance, SessionNode } from '../models/folder-tree.models';
import {
  addFolder,
  collectAncestorIds,
  insertNode,
  isAncestorOrSelf,
  removeNode,
  renameFolder,
} from './tree-helpers';

type State = {
  sessions: SessionNode[];
  layoutsById: Record<string, LayoutInstance>;
  selectedFileId: string | null;
};

const initialState: State = {
  sessions: [],
  layoutsById: {},
  selectedFileId: null,
};

export const FolderTreeStore = signalStore(
  withState(initialState),

  withComputed(({ sessions, layoutsById, selectedFileId }) => ({
    // IDs of folders to expand so the selected file becomes visible. If the
    // selection lives inside the real session tree we return that path; if it
    // only exists as an orphan layout we return the synthetic "Others" path.
    // The hardcoded ids ('others-root', `others-${uname}`) must stay in sync
    // with the rows produced by flattenSessions in tree-helpers.ts.
    selectedFileAncestors: computed<string[]>(() => {
      const fileId = selectedFileId();
      if (!fileId) return [];

      const sessionPath = collectAncestorIds(sessions(), fileId);
      if (sessionPath !== null) return sessionPath;

      const layout = layoutsById()[fileId];
      if (layout) {
        const uname = layout.username || 'Unknown User';
        return ['others-root', `others-${uname}`];
      }

      return [];
    }),
  })),

  withMethods((store) => ({
    initData(sessions: SessionNode[], layouts: LayoutInstance[]): void {
      patchState(store, {
        sessions,
        layoutsById: Object.fromEntries(layouts.map((l) => [l.id, l])),
      });
    },

    selectFile(fileId: string | null): void {
      patchState(store, { selectedFileId: fileId });
    },

    moveNode(draggedId: string, targetFolderId: string | null, index?: number): void {
      const current = store.sessions();
      // Reject drops that would create a cycle (folder into itself/descendant).
      // The drag UI already filters these out, but we guard here too for any
      // programmatic caller.
      if (targetFolderId !== null && isAncestorOrSelf(current, draggedId, targetFolderId)) return;
      const { forest: without, removed } = removeNode(current, draggedId);
      if (!removed) return;
      patchState(store, { sessions: insertNode(without, removed, targetFolderId, index) });
    },

    // Deletes a node from the session tree. For files we also drop the matching
    // layoutsById entry so the layout doesn't reappear under "Others", and we
    // clear the selection if it was pointing at the deleted node.
    deleteNode(id: string): void {
      const { forest } = removeNode(store.sessions(), id);
      const currentLayouts = { ...store.layoutsById() };
      delete currentLayouts[id];
      const patch: Partial<State> = { sessions: forest, layoutsById: currentLayouts };
      if (store.selectedFileId() === id) patch.selectedFileId = null;
      patchState(store, patch);
    },

    renameFolder(id: string, newName: string): void {
      const trimmed = newName.trim();
      if (!trimmed) return;
      patchState(store, { sessions: renameFolder(store.sessions(), id, trimmed) });
    },

    addFolder(parentFolderId: string | null, name: string): string {
      const { forest, newId } = addFolder(store.sessions(), parentFolderId, name);
      patchState(store, { sessions: forest });
      return newId;
    },
  })),
);

export type FolderTreeStore = InstanceType<typeof FolderTreeStore>;
