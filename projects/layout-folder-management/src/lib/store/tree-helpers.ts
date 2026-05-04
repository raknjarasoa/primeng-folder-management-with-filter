import { SessionNode } from '../models/folder-tree.models';

export interface NodeLocation {
  node: SessionNode;
  parent: SessionNode | null;
  index: number;
  siblings: SessionNode[];
}

export function findLocation(
  forest: SessionNode[],
  id: string,
): NodeLocation | null {
  const stack: Array<{ siblings: SessionNode[]; parent: SessionNode | null }> = [
    { siblings: forest, parent: null },
  ];
  while (stack.length) {
    const { siblings, parent } = stack.pop()!;
    for (let i = 0; i < siblings.length; i++) {
      const node = siblings[i];
      if (node.id === id) return { node, parent, index: i, siblings };
      if (node.children?.length) {
        stack.push({ siblings: node.children, parent: node });
      }
    }
  }
  return null;
}

export function isAncestorOrSelf(
  forest: SessionNode[],
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) return true;
  const loc = findLocation(forest, ancestorId);
  if (!loc || !loc.node.children) return false;
  return findLocation(loc.node.children, descendantId) !== null;
}

export function removeNode(
  forest: SessionNode[],
  id: string,
): { forest: SessionNode[]; removed: SessionNode | null } {
  const cloned = structuredClone(forest);
  const loc = findLocation(cloned, id);
  if (!loc) return { forest: cloned, removed: null };
  const [removed] = loc.siblings.splice(loc.index, 1);
  return { forest: cloned, removed };
}

export function insertNode(
  forest: SessionNode[],
  node: SessionNode,
  targetFolderId: string | null,
  index?: number,
): SessionNode[] {
  const cloned = structuredClone(forest);
  if (targetFolderId === null) {
    const at = index ?? cloned.length;
    cloned.splice(at, 0, node);
    return cloned;
  }
  const loc = findLocation(cloned, targetFolderId);
  if (!loc || loc.node.kind !== 'folder') {
    cloned.push(node);
    return cloned;
  }
  loc.node.children = loc.node.children ?? [];
  const at = index ?? loc.node.children.length;
  loc.node.children.splice(at, 0, node);
  return cloned;
}

export function renameFolder(
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  const cloned = structuredClone(forest);
  const loc = findLocation(cloned, id);
  if (!loc || loc.node.kind !== 'folder') return cloned;
  loc.node.name = newName;
  return cloned;
}

export function findParentId(
  forest: SessionNode[],
  childId: string,
): string | null | undefined {
  const loc = findLocation(forest, childId);
  if (!loc) return undefined;
  return loc.parent?.id ?? null;
}

export function addFolder(
  forest: SessionNode[],
  parentFolderId: string | null,
  name: string,
): { forest: SessionNode[]; newId: string } {
  const newId = `f-${Date.now().toString(36)}`;
  const folder: SessionNode = { id: newId, kind: 'folder', name, children: [] };
  const newForest = insertNode(forest, folder, parentFolderId);
  return { forest: newForest, newId };
}

export function collectAncestorIds(
  forest: SessionNode[],
  targetId: string,
): string[] {
  const path: string[] = [];
  const found = walkPath(forest, targetId, path);
  return found ? path : [];
}

function walkPath(
  nodes: SessionNode[],
  targetId: string,
  path: string[],
): boolean {
  for (const node of nodes) {
    if (node.id === targetId) return true;
    if (node.children?.length) {
      path.push(node.id);
      if (walkPath(node.children, targetId, path)) return true;
      path.pop();
    }
  }
  return false;
}
