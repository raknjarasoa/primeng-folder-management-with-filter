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
  LayoutInstance,
  NodeData,
  SessionNode,
  isFileNode,
  isFolderNode,
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

  withComputed(({ sessions, layoutsById }) => ({
    treeNodes: computed<TreeNode<NodeData>[]>(() =>
      toTreeNodes(sessions(), layoutsById()),
    ),
  })),

  withComputed(({ sessions, layoutsById, selectedFileId }) => ({
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
      if (targetFolderId !== null && isAncestorOrSelf(current, draggedId, targetFolderId)) return;
      const { forest: without, removed } = removeNode(current, draggedId);
      if (!removed) return;
      patchState(store, { sessions: insertNode(without, removed, targetFolderId, index) });
    },

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

function toTreeNodes(
  sessions: SessionNode[],
  layoutsById: Record<string, LayoutInstance>,
): TreeNode<NodeData>[] {
  const nodes = sessions.map((s) => sessionToTreeNode(s, layoutsById));

  const sessionFileIds = new Set<string>();
  const walk = (list: SessionNode[]) => {
    for (const n of list) {
      if (isFileNode(n)) sessionFileIds.add(n.id);
      if (isFolderNode(n)) walk(n.children);
    }
  };
  walk(sessions);

  const othersByUsername: Record<string, LayoutInstance[]> = {};
  for (const layout of Object.values(layoutsById)) {
    if (!sessionFileIds.has(layout.id)) {
      const uname = layout.username || 'Unknown User';
      (othersByUsername[uname] ??= []).push(layout);
    }
  }

  const usernames = Object.keys(othersByUsername).sort();
  if (usernames.length) {
    const userFolders: TreeNode<NodeData>[] = usernames.map((uname) => ({
      key: `others-${uname}`,
      label: uname,
      icon: 'fas fa-folder',
      droppable: false,
      draggable: false,
      children: othersByUsername[uname].map((layout) => ({
        key: layout.id,
        label: layout.name,
        icon: 'fas fa-file',
        droppable: false,
        draggable: false,
        leaf: true,
        data: { id: layout.id, kind: 'file', layout, isOther: true },
      })),
      data: { id: `others-${uname}`, kind: 'folder', isOther: true },
    }));

    nodes.push({
      key: 'others-root',
      label: 'Others',
      icon: 'fas fa-folder',
      droppable: false,
      draggable: false,
      children: userFolders,
      data: { id: 'others-root', kind: 'folder', isOther: true },
    });
  }

  return nodes;
}

function sessionToTreeNode(
  s: SessionNode,
  layoutsById: Record<string, LayoutInstance>,
): TreeNode<NodeData> {
  if (isFolderNode(s)) {
    return {
      key: s.id,
      label: s.name,
      icon: 'fas fa-folder',
      droppable: true,
      draggable: true,
      children: s.children.map((c) => sessionToTreeNode(c, layoutsById)),
      data: { id: s.id, kind: 'folder' },
    };
  }
  const layout = layoutsById[s.id];
  return {
    key: s.id,
    label: layout?.name ?? `(missing layout: ${s.id})`,
    icon: 'fas fa-file',
    droppable: false,
    draggable: true,
    leaf: true,
    data: { id: s.id, kind: 'file', layout },
  };
}
