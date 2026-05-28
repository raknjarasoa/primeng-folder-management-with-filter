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

// Helper for structural sharing
function shallowUpdate(
  forest: SessionNode[],
  targetId: string | null,
  updateFn: (siblings: SessionNode[]) => SessionNode[]
): SessionNode[] {
  if (targetId === null) {
    return updateFn([...forest]);
  }

  // Walk the tree to find the target and rebuild the path back to the root
  function walk(nodes: SessionNode[]): { newNodes: SessionNode[]; found: boolean } {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === targetId) {
        // We found the target level! However, updateFn expects to mutate the siblings array itself
        // or return a new one.
        const newSiblings = [...nodes];
        return { newNodes: updateFn(newSiblings), found: true };
      }

      if (isFolder(node) && node.children.length > 0) {
        const { newNodes: newChildren, found } = walk(node.children);
        if (found) {
          const newSiblings = [...nodes];
          newSiblings[i] = { ...node, children: newChildren };
          return { newNodes: newSiblings, found: true };
        }
      }
    }
    return { newNodes: nodes, found: false };
  }

  const { newNodes, found } = walk(forest);
  return found ? newNodes : forest;
}


export function removeNode(
  forest: SessionNode[],
  id: string,
): { forest: SessionNode[]; removed: SessionNode | null } {
  let removed: SessionNode | null = null;
  let targetParentId: string | null = null;

  const loc = findLocation(forest, id);
  if (!loc) return { forest, removed: null };
  removed = loc.node;
  targetParentId = loc.parent ? loc.parent.id : null;

  const newForest = shallowUpdate(forest, removed.id, (siblings) => {
    const idx = siblings.findIndex(n => n.id === id);
    if (idx !== -1) {
      siblings.splice(idx, 1);
    }
    return siblings;
  });

  return { forest: newForest, removed };
}

export function insertNode(
  forest: SessionNode[],
  node: SessionNode,
  targetFolderId: string | null,
  index?: number,
): SessionNode[] {
  if (targetFolderId === null) {
    const newForest = [...forest];
    newForest.splice(index ?? newForest.length, 0, node);
    return newForest;
  }

  // Find the target folder so we can update its children.
  function walk(nodes: SessionNode[]): { newNodes: SessionNode[]; found: boolean } {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === targetFolderId) {
        if (!isFolder(n)) {
          // If target is not a folder, we can't insert into it.
          // Previous logic fell back to pushing to the root of cloned forest, but
          // looking at the old code:
          // if (!loc || !isFolder(loc.node)) { cloned.push(node); return cloned; }
          return { newNodes: nodes, found: false };
        }

        const newSiblings = [...nodes];
        const newChildren = [...n.children];
        newChildren.splice(index ?? newChildren.length, 0, node);
        newSiblings[i] = { ...n, children: newChildren };
        return { newNodes: newSiblings, found: true };
      }

      if (isFolder(n) && n.children.length > 0) {
        const { newNodes: newChildren, found } = walk(n.children);
        if (found) {
          const newSiblings = [...nodes];
          newSiblings[i] = { ...n, children: newChildren };
          return { newNodes: newSiblings, found: true };
        }
      }
    }
    return { newNodes: nodes, found: false };
  }

  const { newNodes, found } = walk(forest);
  if (!found) {
    // Fallback: if not found or not a folder, append to root.
    return [...forest, node];
  }
  return newNodes;
}

export function renameFolder(
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  function walk(nodes: SessionNode[]): { newNodes: SessionNode[]; found: boolean } {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) {
        if (!isFolder(node)) return { newNodes: nodes, found: true }; // don't modify files
        const newSiblings = [...nodes];
        newSiblings[i] = { ...node, name: newName };
        return { newNodes: newSiblings, found: true };
      }
      if (isFolder(node) && node.children.length > 0) {
        const { newNodes: newChildren, found } = walk(node.children);
        if (found) {
          const newSiblings = [...nodes];
          newSiblings[i] = { ...node, children: newChildren };
          return { newNodes: newSiblings, found: true };
        }
      }
    }
    return { newNodes: nodes, found: false };
  }

  const { newNodes, found } = walk(forest);

  // Previous code cloned the whole forest even if not found.
  // We match the old behaviour where if id was missing, it returned a newly cloned array.
  return found ? newNodes : [...forest];
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
