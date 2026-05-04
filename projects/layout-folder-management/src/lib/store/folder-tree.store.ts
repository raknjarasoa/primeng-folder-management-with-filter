import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { TreeNode } from 'primeng/api';

import {
  Layout,
  NodeData,
  SessionNode,
} from '../models/folder-tree.models';
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
  layoutsById: Record<string, Layout>;
  selectedFileId: string | null;
};

const initialState: State = {
  sessions: [],
  layoutsById: {},
  selectedFileId: null,
};

export const FolderTreeStore = signalStore(
  withState(initialState),

  withComputed(({ sessions, layoutsById }) => ({
    treeNodes: computed<TreeNode<NodeData>[]>(() =>
      toTreeNodes(sessions(), layoutsById()),
    ),
  })),

  withComputed(({ sessions, selectedFileId }) => ({
    selectedFileAncestors: computed<string[]>(() => {
      const fileId = selectedFileId();
      if (!fileId) return [];
      return collectAncestorIds(sessions(), fileId);
    }),
  })),

  withMethods((store) => ({
    initData(sessions: SessionNode[], layouts: Layout[]): void {
      const layoutsById = Object.fromEntries(
        layouts.map((l) => [l.id, l]),
      );
      patchState(store, { sessions, layoutsById });
    },

    selectFile(fileId: string | null): void {
      patchState(store, { selectedFileId: fileId });
    },

    moveNode(
      draggedId: string,
      targetFolderId: string | null,
      index?: number,
    ): void {
      const current = store.sessions();

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

    deleteNode(id: string): void {
      const { forest } = removeNode(store.sessions(), id);
      const patch: Partial<State> = { sessions: forest };
      if (store.selectedFileId() === id) patch.selectedFileId = null;
      patchState(store, patch);
    },

    renameFolder(id: string, newName: string): void {
      const trimmed = newName.trim();
      if (!trimmed) return;
      patchState(store, {
        sessions: renameFolder(store.sessions(), id, trimmed),
      });
    },

    addFolder(parentFolderId: string | null, name: string): string {
      const { forest, newId } = addFolder(
        store.sessions(),
        parentFolderId,
        name,
      );
      patchState(store, { sessions: forest });
      return newId;
    },
  })),
);

export type FolderTreeStore = InstanceType<typeof FolderTreeStore>;

function toTreeNodes(
  sessions: SessionNode[],
  layoutsById: Record<string, Layout>,
): TreeNode<NodeData>[] {
  return sessions.map((s) => sessionToTreeNode(s, layoutsById));
}

function sessionToTreeNode(
  s: SessionNode,
  layoutsById: Record<string, Layout>,
): TreeNode<NodeData> {
  if (s.kind === 'folder') {
    return {
      key: s.id,
      label: s.name ?? '(untitled folder)',
      icon: 'pi pi-folder',
      droppable: true,
      draggable: true,
      children: (s.children ?? []).map((c) => sessionToTreeNode(c, layoutsById)),
      data: { id: s.id, kind: 'folder' },
    };
  }
  const layout = layoutsById[s.id];
  return {
    key: s.id,
    label: layout?.name ?? `(missing layout: ${s.id})`,
    icon: 'pi pi-file',
    droppable: false,
    draggable: true,
    leaf: true,
    data: { id: s.id, kind: 'file', layout },
  };
}
