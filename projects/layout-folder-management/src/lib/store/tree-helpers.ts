import { SessionNode, isFolder } from '../models/folder-tree.models';

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
      if (isFolder(node) && node.children.length) {
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
  if (!loc || !isFolder(loc.node)) return false;
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
    cloned.splice(index ?? cloned.length, 0, node);
    return cloned;
  }
  const loc = findLocation(cloned, targetFolderId);
  if (!loc || !isFolder(loc.node)) {
    cloned.push(node);
    return cloned;
  }
  loc.node.children.splice(index ?? loc.node.children.length, 0, node);
  return cloned;
}

export function renameFolder(
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  const cloned = structuredClone(forest);
  const loc = findLocation(cloned, id);
  if (!loc || !isFolder(loc.node)) return cloned;
  loc.node.name = newName;
  return cloned;
}

export function addFolder(
  forest: SessionNode[],
  parentFolderId: string | null,
  name: string,
): { forest: SessionNode[]; newId: string } {
  const newId = `f-${Date.now().toString(36)}`;
  const folder: SessionNode = { id: newId, kind: 'folder', name, children: [] };
  return { forest: insertNode(forest, folder, parentFolderId, 0), newId };
}

export function collectAncestorIds(
  forest: SessionNode[],
  targetId: string,
): string[] | null {
  const path: string[] = [];
  return walkPath(forest, targetId, path) ? path : null;
}

function walkPath(nodes: SessionNode[], targetId: string, path: string[]): boolean {
  for (const node of nodes) {
    if (node.id === targetId) return true;
    if (isFolder(node) && node.children.length) {
      path.push(node.id);
      if (walkPath(node.children, targetId, path)) return true;
      path.pop();
    }
  }
  return false;
}
