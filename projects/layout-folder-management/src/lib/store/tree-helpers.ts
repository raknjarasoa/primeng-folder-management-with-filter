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
  let removed: SessionNode | null = null;

  function remove(nodes: SessionNode[]): SessionNode[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) {
        removed = node;
        const newNodes = [...nodes];
        newNodes.splice(i, 1);
        return newNodes;
      }
      if (isFolder(node) && node.children) {
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
  forest: SessionNode[],
  nodeToInsert: SessionNode,
  targetFolderId: string | null,
  index?: number,
): SessionNode[] {
  if (targetFolderId === null) {
    const newForest = [...forest];
    newForest.splice(index ?? newForest.length, 0, nodeToInsert);
    return newForest;
  }

  function insert(nodes: SessionNode[]): SessionNode[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === targetFolderId && isFolder(node)) {
        const newNodes = [...nodes];
        const newChildren = [...node.children];
        newChildren.splice(index ?? newChildren.length, 0, nodeToInsert);
        newNodes[i] = { ...node, children: newChildren };
        return newNodes;
      }
      if (isFolder(node) && node.children) {
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
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  function rename(nodes: SessionNode[]): SessionNode[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id && isFolder(node)) {
        const newNodes = [...nodes];
        newNodes[i] = { ...node, name: newName };
        return newNodes;
      }
      if (isFolder(node) && node.children) {
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

  const newForest = rename(forest);
  return newForest;
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
