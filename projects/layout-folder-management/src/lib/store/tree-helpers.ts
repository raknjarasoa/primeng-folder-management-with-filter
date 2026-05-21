import { Guid } from 'guid-typescript'
import {
  FlatRowData,
  TreeItem,
  isFolderNode,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';

export type NodeLocation = {
  node: TreeItem;
  parent: TreeItem | null;
  index: number;
  siblings: TreeItem[];
};

export function findLocation(
  forest: TreeItem[],
  id: string,
): NodeLocation | null {
  if (!forest || !id) return null;
  const stack: Array<{ siblings: TreeItem[]; parent: TreeItem | null }> = [
    { siblings: forest, parent: null },
  ];
  while (stack.length) {
    const { siblings, parent } = stack.pop()!;
    if (!siblings) continue;
    for (let i = 0; i < siblings.length; i++) {
      const node = siblings[i];
      if (!node) continue;
      if (node.id === id) return { node, parent, index: i, siblings };
      if (isFolderNode(node) && Array.isArray(node.children) && node.children.length) {
        stack.push({ siblings: node.children, parent: node });
      }
    }
  }
  return null;
}

export function isAncestorOrSelf(
  forest: TreeItem[],
  ancestorId: string,
  descendantId: string,
): boolean {
  if (!forest || !ancestorId || !descendantId) return false;
  if (ancestorId === descendantId) return true;
  const loc = findLocation(forest, ancestorId);
  if (!loc || !isFolderNode(loc.node) || !Array.isArray(loc.node.children)) return false;
  return findLocation(loc.node.children, descendantId) !== null;
}

export function removeNode(
  forest: TreeItem[],
  id: string,
): { forest: TreeItem[]; removed: TreeItem | null } {
  let removed: TreeItem | null = null;
  if (!forest || !id) return { forest: [], removed: null };

  function remove(nodes: TreeItem[]): TreeItem[] {
    if (!nodes) return [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      if (node.id === id) {
        removed = node;
        const newNodes = [...nodes];
        newNodes.splice(i, 1);
        return newNodes;
      }
      if (isFolderNode(node) && Array.isArray(node.children)) {
        const newChildren = remove(node.children);
        if (newChildren !== node.children) {
          const newNodes = [...nodes];
          newNodes[i] = { ...node, children: newChildren };
          return newNodes;
        }
      }
    }
    return nodes;
  }

  const newForest = remove(forest);
  return { forest: newForest, removed };
}

export function insertNode(
  forest: TreeItem[],
  nodeToInsert: TreeItem,
  targetFolderId: string | null,
  index?: number,
): TreeItem[] {
  if (!forest || !nodeToInsert) return forest || [];
  if (targetFolderId === null) {
    const newForest = [...forest];
    newForest.splice(index ?? newForest.length, 0, nodeToInsert);
    return newForest;
  }

  function insert(nodes: TreeItem[]): TreeItem[] {
    if (!nodes) return [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      if (node.id === targetFolderId && isFolderNode(node)) {
        const newNodes = [...nodes];
        const newChildren = Array.isArray(node.children) ? [...node.children] : [];
        newChildren.splice(index ?? newChildren.length, 0, nodeToInsert);
        newNodes[i] = { ...node, children: newChildren };
        return newNodes;
      }
      if (isFolderNode(node) && Array.isArray(node.children)) {
        const newChildren = insert(node.children);
        if (newChildren !== node.children) {
          const newNodes = [...nodes];
          newNodes[i] = { ...node, children: newChildren };
          return newNodes;
        }
      }
    }
    return nodes;
  }

  const newForest = insert(forest);
  if (newForest === forest) {
    return [...forest, nodeToInsert];
  }
  return newForest;
}

export function renameFolder(
  forest: TreeItem[],
  id: string,
  newName: string,
): TreeItem[] {
  if (!forest || !id) return forest || [];
  function rename(nodes: TreeItem[]): TreeItem[] {
    if (!nodes) return [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      if (node.id === id && isFolderNode(node)) {
        const newNodes = [...nodes];
        newNodes[i] = { ...node, name: newName };
        return newNodes;
      }
      if (isFolderNode(node) && Array.isArray(node.children)) {
        const newChildren = rename(node.children);
        if (newChildren !== node.children) {
          const newNodes = [...nodes];
          newNodes[i] = { ...node, children: newChildren };
          return newNodes;
        }
      }
    }
    return nodes;
  }

  return rename(forest);
}

export function addFolder(
  forest: TreeItem[],
  parentFolderId: string | null,
  name: string,
): { forest: TreeItem[]; newId: string } {
  const newId = `folder-${Guid.create().toString()}`;
  const folder: TreeItem = { id: newId, kind: 'folder', name, children: [] };
  const newForest = insertNode(forest, folder, parentFolderId, 0);
  return { forest: newForest, newId };
}

export function collectAncestorIds(
  forest: TreeItem[],
  targetId: string,
): string[] | null {
  if (!forest || !targetId) return null;
  const path: string[] = [];
  const found = walkPath(forest, targetId, path);
  return found ? path : null;
}

function walkPath(nodes: TreeItem[], targetId: string, path: string[]): boolean {
  if (!nodes) return false;
  for (const node of nodes) {
    if (!node) continue;
    if (node.id === targetId) return true;
    if (isFolderNode(node) && Array.isArray(node.children) && node.children.length) {
      path.push(node.id);
      if (walkPath(node.children, targetId, path)) return true;
      path.pop();
    }
  }
  return false;
}

export function collectSubtreeIds(
  forest: TreeItem[],
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  if (!forest || !rootId) return out;
  const loc = findLocation(forest, rootId);
  if (!loc) return out;
  out.add(rootId);
  if (isFolderNode(loc.node) && Array.isArray(loc.node.children)) {
    collectAllIds(loc.node.children, out);
  }
  return out;
}

function collectAllIds(nodes: TreeItem[], out: Set<string>): void {
  if (!nodes) return;
  for (const n of nodes) {
    if (!n) continue;
    out.add(n.id);
    if (isFolderNode(n) && Array.isArray(n.children)) collectAllIds(n.children, out);
  }
}

export type FolderOption = {
  id: string;
  label: string;
  depth: number;
};

export function flattenFolders(
  forest: TreeItem[],
  excludeIds: ReadonlySet<string>,
): FolderOption[] {
  const result: FolderOption[] = [];
  if (!forest) return result;
  const walk = (nodes: TreeItem[], depth: number): void => {
    if (!nodes) return;
    for (const node of nodes) {
      if (!node) continue;
      if (!isFolderNode(node) || (excludeIds && excludeIds.has(node.id))) continue;
      result.push({ id: node.id, label: node.name || 'Unnamed Folder', depth });
      if (Array.isArray(node.children)) walk(node.children, depth + 1);
    }
  };
  walk(forest, 0);
  return result;
}

export const OTHERS_ROOT_ID = 'virtual-others-root';
export const OTHERS_USER_PREFIX = 'virtual-user-';

export type OrphanGroups = {
  othersByUsername: Record<string, LayoutInstance[]>;
  othersUsernames: string[];
};

export function groupOrphanLayouts(
  layoutsById: Record<string, LayoutInstance>,
  sessionFileIds: ReadonlySet<string>,
): OrphanGroups {
  const othersByUsername: Record<string, LayoutInstance[]> = {};
  if (layoutsById) {
    for (const layout of Object.values(layoutsById)) {
      if (!layout || !layout.id) continue;
      if (sessionFileIds && sessionFileIds.has(layout.id)) continue;
      const uname = layout.username || 'Unknown User';
      (othersByUsername[uname] ??= []).push(layout);
    }
  }
  return {
    othersByUsername,
    othersUsernames: Object.keys(othersByUsername).sort(),
  };
}

export function flattenSessions(
  sessions: TreeItem[],
  layoutsById: Record<string, LayoutInstance>,
  orphanGroups: OrphanGroups,
  expandedIds: ReadonlySet<string>,
  filter = '',
): FlatRowData[] {
  const query = filter.trim().toLowerCase();
  const result: FlatRowData[] = [];
  const { othersByUsername, othersUsernames } = orphanGroups || { othersByUsername: {}, othersUsernames: [] };

  let includeSet: Set<string> | null = null;
  if (query) {
    includeSet = new Set<string>();
    buildIncludeSet(sessions || [], layoutsById || {}, query, includeSet);
    buildOthersIncludeSet(othersByUsername || {}, query, includeSet);
  }

  const isExpanded = (id: string): boolean =>
    includeSet !== null ? includeSet.has(id) : (expandedIds && expandedIds.has(id));

  const walk = (nodes: TreeItem[], depth: number): void => {
    if (!nodes) return;
    for (const node of nodes) {
      if (!node) continue;
      if (includeSet && !includeSet.has(node.id)) continue;
      if (isFolderNode(node)) {
        const expanded = isExpanded(node.id);
        result.push({
          id: node.id,
          kind: 'folder',
          label: node.name || 'Unnamed Folder',
          depth,
          expanded,
          hasChildren: Array.isArray(node.children) && node.children.length > 0,
        });
        if (expanded && Array.isArray(node.children)) walk(node.children, depth + 1);
      } else {
        const layout = layoutsById ? layoutsById[node.id] : undefined;
        if (!layout) continue;
        result.push({
          id: node.id,
          kind: 'file',
          label: layout.name || 'Unnamed Layout',
          depth,
          expanded: false,
          hasChildren: false,
          layout,
        });
      }
    }
  };
  walk(sessions || [], 0);

  const othersIncluded =
    Array.isArray(othersUsernames) &&
    othersUsernames.length > 0 &&
    (!includeSet || includeSet.has(OTHERS_ROOT_ID));
  if (othersIncluded) {
    const rootExpanded = isExpanded(OTHERS_ROOT_ID);
    result.push({
      id: OTHERS_ROOT_ID,
      kind: 'folder',
      label: 'Other Users',
      depth: 0,
      expanded: rootExpanded,
      hasChildren: true,
      isOther: true,
    });
    if (rootExpanded) {
      for (const uname of othersUsernames) {
        const userId = OTHERS_USER_PREFIX + uname;
        if (includeSet && !includeSet.has(userId)) continue;
        const userExpanded = isExpanded(userId);
        result.push({
          id: userId,
          kind: 'folder',
          label: uname,
          depth: 1,
          expanded: userExpanded,
          hasChildren: true,
          isOther: true,
        });
        if (userExpanded && othersByUsername[uname]) {
          for (const layout of othersByUsername[uname]) {
            if (!layout) continue;
            if (includeSet && !includeSet.has(layout.id)) continue;
            result.push({
              id: layout.id,
              kind: 'file',
              label: layout.name || 'Unnamed Layout',
              depth: 2,
              expanded: false,
              hasChildren: false,
              layout,
              isOther: true,
            });
          }
        }
      }
    }
  }

  return result;
}

export function collectSessionFileIds(sessions: TreeItem[]): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: TreeItem[]): void => {
    if (!nodes) return;
    for (const n of nodes) {
      if (!n) continue;
      if (isFolderNode(n) && Array.isArray(n.children)) walk(n.children);
      else if (n.id) ids.add(n.id);
    }
  };
  walk(sessions);
  return ids;
}

function buildIncludeSet(
  nodes: TreeItem[],
  layoutsById: Record<string, LayoutInstance>,
  query: string,
  out: Set<string>,
): boolean {
  if (!nodes) return false;
  let anyMatched = false;
  for (const node of nodes) {
    if (!node) continue;
    let matched = false;
    if (isFolderNode(node) && Array.isArray(node.children)) {
      const labelMatch = (node.name || '').toLowerCase().includes(query);
      const childMatch = buildIncludeSet(node.children, layoutsById, query, out);
      matched = labelMatch || childMatch;
    } else {
      const layout = layoutsById ? layoutsById[node.id] : undefined;
      matched = matchesLayout(layout, query);
    }
    if (matched) {
      out.add(node.id);
      anyMatched = true;
    }
  }
  return anyMatched;
}

function buildOthersIncludeSet(
  othersByUsername: Record<string, LayoutInstance[]>,
  query: string,
  out: Set<string>,
): void {
  if (!othersByUsername) return;
  let anyMatched = false;
  for (const uname of Object.keys(othersByUsername)) {
    const userId = OTHERS_USER_PREFIX + uname;
    let userHas = uname.toLowerCase().includes(query);
    const list = othersByUsername[uname];
    if (Array.isArray(list)) {
      for (const layout of list) {
        if (matchesLayout(layout, query)) {
          out.add(layout.id);
          userHas = true;
        }
      }
    }
    if (userHas) {
      out.add(userId);
      anyMatched = true;
    }
  }
  if (anyMatched) out.add(OTHERS_ROOT_ID);
}

function matchesLayout(layout: LayoutInstance | undefined, query: string): boolean {
  if (!layout) return false;
  if ((layout.name || '').toLowerCase().includes(query)) return true;
  if ((layout.username || '').toLowerCase().includes(query)) return true;
  if ((layout.description || '').toLowerCase().includes(query)) return true;
  return false;
}
