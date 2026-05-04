import { SessionNode } from '../models/folder-tree.models';

/**
 * Pure tree helpers. No Angular, no signals — all functions operate on
 * SessionNode[] and return new arrays/nodes. Centralizing here keeps the
 * SignalStore methods tiny and lets us test the logic in isolation.
 *
 * IMPORTANT: every operation produces a new tree (immutable updates) so
 * patchState triggers signal reactivity correctly.
 */

/** Deep-clone a forest. We avoid structuredClone for IE/older browser safety. */
export function cloneForest(nodes: SessionNode[]): SessionNode[] {
  return nodes.map(cloneNode);
}

function cloneNode(node: SessionNode): SessionNode {
  const copy: SessionNode = { id: node.id, kind: node.kind };
  if (node.name !== undefined) copy.name = node.name;
  if (node.children) copy.children = node.children.map(cloneNode);
  return copy;
}

/** Locate a node + its parent path. Returns null if not found. */
export interface NodeLocation {
  node: SessionNode;
  parent: SessionNode | null; // null = root
  index: number;
  /** Sibling array containing the node — handy for in-place reorder. */
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

/** True if `ancestorId` is `descendantId` itself or one of its ancestors in `forest`. */
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

/** Remove a node by id, return the cloned forest + the removed node. */
export function removeNode(
  forest: SessionNode[],
  id: string,
): { forest: SessionNode[]; removed: SessionNode | null } {
  const cloned = cloneForest(forest);
  const loc = findLocation(cloned, id);
  if (!loc) return { forest: cloned, removed: null };
  const [removed] = loc.siblings.splice(loc.index, 1);
  return { forest: cloned, removed };
}

/**
 * Insert `node` into `forest`:
 *   - If `targetFolderId` is null -> root level
 *   - If `index` is undefined     -> append to end
 * Returns a new forest. Does NOT clone `node` — caller is responsible.
 */
export function insertNode(
  forest: SessionNode[],
  node: SessionNode,
  targetFolderId: string | null,
  index?: number,
): SessionNode[] {
  const cloned = cloneForest(forest);
  if (targetFolderId === null) {
    const at = index ?? cloned.length;
    cloned.splice(at, 0, node);
    return cloned;
  }
  const loc = findLocation(cloned, targetFolderId);
  if (!loc || loc.node.kind !== 'folder') {
    // Fail-safe: target gone or not a folder — append to root.
    cloned.push(node);
    return cloned;
  }
  loc.node.children = loc.node.children ?? [];
  const at = index ?? loc.node.children.length;
  loc.node.children.splice(at, 0, node);
  return cloned;
}

/** Rename a folder by id. Returns a new forest. No-op if id is a file or missing. */
export function renameFolder(
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  const cloned = cloneForest(forest);
  const loc = findLocation(cloned, id);
  if (!loc || loc.node.kind !== 'folder') return cloned;
  loc.node.name = newName;
  return cloned;
}

/** Find the parent folder id of a node, or null if it's at root. */
export function findParentId(
  forest: SessionNode[],
  childId: string,
): string | null | undefined {
  const loc = findLocation(forest, childId);
  if (!loc) return undefined; // not found
  return loc.parent?.id ?? null;
}

/**
 * Add a new empty folder to the forest.
 *   - If `parentFolderId` is null → root level
 * Returns the new forest and the generated folder id.
 */
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

/**
 * Collect all ancestor keys (folder ids) leading to a given node.
 * Used to auto-expand the tree to reveal a specific node.
 * Returns keys from root ancestor down to (but excluding) the target.
 */
export function collectAncestorIds(
  forest: SessionNode[],
  targetId: string,
): string[] {
  const path: string[] = [];
  const found = walkPath(forest, targetId, path);
  return found ? path : [];
}

/** Recursive DFS — pushes ancestor ids into `path` if target is found. */
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
