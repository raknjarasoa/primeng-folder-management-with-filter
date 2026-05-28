import { FolderNode, SessionNode, isFolder } from '../models/folder-tree.models';

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
  return walkForLocation(forest, null, id);
}

function walkForLocation(
  siblings: SessionNode[],
  parent: SessionNode | null,
  id: string,
): NodeLocation | null {
  for (let i = 0; i < siblings.length; i++) {
    const node = siblings[i];
    if (node.id === id) return { node, parent, index: i, siblings };
    if (isFolder(node) && node.children.length) {
      const found = walkForLocation(node.children, node, id);
      if (found) return found;
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

// ---------------------------------------------------------------------------
// Path-copy mutators
//
// `structuredClone` of the whole forest is O(total nodes) on every mutation –
// on a tree with thousands of nodes that adds tens of milliseconds of GC
// pressure per drag-drop, which is felt as jank on slower (Windows /
// integrated-GPU) machines. Instead, we walk to the target, record the path
// of (siblings-array, index) pairs we traversed, and only clone the spine –
// O(depth) arrays, leaving every unchanged subtree as a shared reference.
// ---------------------------------------------------------------------------

interface PathStep {
  siblings: SessionNode[];
  index: number;
}

function findPath(forest: SessionNode[], id: string): PathStep[] | null {
  const path: PathStep[] = [];
  return collectPath(forest, id, path) ? path : null;
}

function collectPath(
  siblings: SessionNode[],
  id: string,
  path: PathStep[],
): boolean {
  for (let i = 0; i < siblings.length; i++) {
    path.push({ siblings, index: i });
    const node = siblings[i];
    if (node.id === id) return true;
    if (isFolder(node) && node.children.length && collectPath(node.children, id, path)) {
      return true;
    }
    path.pop();
  }
  return false;
}

// Given the path from root to a target node and a transformer that produces
// a new version of the target's siblings array, rebuild every ancestor along
// the spine so the new forest shares structure with the old one everywhere
// off-path.
function rebuildSpine(
  path: PathStep[],
  transform: (siblings: SessionNode[], index: number) => SessionNode[],
): SessionNode[] {
  const leaf = path[path.length - 1];
  let nextSiblings = transform(leaf.siblings, leaf.index);

  for (let depth = path.length - 2; depth >= 0; depth--) {
    const step = path[depth];
    const ancestor = step.siblings[step.index] as FolderNode;
    const replaced: FolderNode = { ...ancestor, children: nextSiblings };
    const clonedSiblings = step.siblings.slice();
    clonedSiblings[step.index] = replaced;
    nextSiblings = clonedSiblings;
  }
  return nextSiblings;
}

export function removeNode(
  forest: SessionNode[],
  id: string,
): { forest: SessionNode[]; removed: SessionNode | null } {
  const path = findPath(forest, id);
  if (!path) return { forest: forest.slice(), removed: null };

  const leaf = path[path.length - 1];
  const removed = leaf.siblings[leaf.index];

  const next = rebuildSpine(path, (siblings, index) => {
    const out = siblings.slice();
    out.splice(index, 1);
    return out;
  });

  return { forest: next, removed };
}

export function insertNode(
  forest: SessionNode[],
  node: SessionNode,
  targetFolderId: string | null,
  index?: number,
): SessionNode[] {
  if (targetFolderId === null) {
    const out = forest.slice();
    out.splice(index ?? out.length, 0, node);
    return out;
  }

  const path = findPath(forest, targetFolderId);
  if (!path) {
    // Target missing – append at root, mirroring the previous behaviour.
    return [...forest, node];
  }

  const leaf = path[path.length - 1];
  const targetFolder = leaf.siblings[leaf.index];
  if (!isFolder(targetFolder)) {
    return [...forest, node];
  }

  return rebuildSpine(path, (siblings, idx) => {
    const folder = siblings[idx] as FolderNode;
    const newChildren = folder.children.slice();
    newChildren.splice(index ?? newChildren.length, 0, node);
    const next = siblings.slice();
    next[idx] = { ...folder, children: newChildren };
    return next;
  });
}

export function renameFolder(
  forest: SessionNode[],
  id: string,
  newName: string,
): SessionNode[] {
  const path = findPath(forest, id);
  if (!path) return forest.slice();

  return rebuildSpine(path, (siblings, index) => {
    const node = siblings[index];
    if (!isFolder(node)) return siblings.slice();
    const next = siblings.slice();
    next[index] = { ...node, name: newName };
    return next;
  });
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
