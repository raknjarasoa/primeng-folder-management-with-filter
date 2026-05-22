import { Guid } from 'guid-typescript';
import {
  FlatRowData,
  TreeItem,
  isFolderNode,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';

/**
 * Represents the resolved location of a node inside the tree hierarchy.
 */
export type NodeLocation = {
  /** The target tree item node itself. */
  node: TreeItem;
  /** The parent folder node of the target item, or null if the item is at the root level. */
  parent: TreeItem | null;
  /** The zero-based index of the node within its sibling list. */
  index: number;
  /** The list of sibling nodes (including the target node itself). */
  siblings: TreeItem[];
};

/**
 * Searches the folder tree to locate a specific node by its unique ID.
 * Returns metadata about the node's location in the tree, or null if not found.
 * 
 * @param forest The folder tree array to search.
 * @param id The unique identifier of the node to locate.
 * @returns The resolved NodeLocation, or null if the node cannot be found.
 */
export function findLocation(
  forest: TreeItem[],
  id: string,
): NodeLocation | null {
  const stack: Array<{ siblings: TreeItem[]; parent: TreeItem | null }> = [
    { siblings: forest, parent: null },
  ];
  while (stack.length) {
    const { siblings, parent } = stack.pop()!;
    for (let i = 0; i < siblings.length; i++) {
      const node = siblings[i];
      if (node.id === id) return { node, parent, index: i, siblings };
      if (isFolderNode(node) && node.children.length) {
        stack.push({ siblings: node.children, parent: node });
      }
    }
  }
  return null;
}

/**
 * Verifies whether an ancestor node is indeed an ancestor of (or identical to) a descendant node.
 * Used as a cycle-detection guard to prevent dropping a folder inside its own subtree.
 * 
 * @param forest The folder tree array.
 * @param ancestorId The ID of the prospective ancestor.
 * @param descendantId The ID of the prospective descendant.
 * @returns True if ancestorId matches descendantId or is a parent/ancestor of descendantId; false otherwise.
 */
export function isAncestorOrSelf(
  forest: TreeItem[],
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) return true;
  const loc = findLocation(forest, ancestorId);
  if (!loc || !isFolderNode(loc.node)) return false;
  return findLocation(loc.node.children, descendantId) !== null;
}

/**
 * Immutably removes a node from the folder tree.
 * 
 * @param forest The folder tree array to remove the node from.
 * @param id The unique identifier of the node to remove.
 * @returns An object containing the new immutable tree structure and the removed node, or null if not found.
 */
export function removeNode(
  forest: TreeItem[],
  id: string,
): { forest: TreeItem[]; removed: TreeItem | null } {
  let removed: TreeItem | null = null;

  function remove(nodes: TreeItem[]): TreeItem[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) {
        removed = node;
        const newNodes = [...nodes];
        newNodes.splice(i, 1);
        return newNodes;
      }
      if (isFolderNode(node) && node.children) {
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

/**
 * Immutably inserts a node into the folder tree at a specific target folder and index.
 * If the target folder is null, the node is inserted at the root of the tree.
 * 
 * @param forest The folder tree array to insert into.
 * @param nodeToInsert The tree item node to insert.
 * @param targetFolderId The ID of the target parent folder, or null for root-level insertion.
 * @param index The zero-based index to insert the node at. Defaults to the end of the children list.
 * @returns The new immutable tree array containing the inserted node.
 */
export function insertNode(
  forest: TreeItem[],
  nodeToInsert: TreeItem,
  targetFolderId: string | null,
  index?: number,
): TreeItem[] {
  if (targetFolderId === null) {
    const newForest = [...forest];
    newForest.splice(index ?? newForest.length, 0, nodeToInsert);
    return newForest;
  }

  function insert(nodes: TreeItem[]): TreeItem[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === targetFolderId && isFolderNode(node)) {
        const newNodes = [...nodes];
        const newChildren = [...node.children];
        newChildren.splice(index ?? newChildren.length, 0, nodeToInsert);
        newNodes[i] = { ...node, children: newChildren };
        return newNodes;
      }
      if (isFolderNode(node) && node.children) {
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

/**
 * Immutably renames a folder in the folder tree.
 * 
 * @param forest The folder tree array.
 * @param id The unique identifier of the folder to rename.
 * @param newName The new label/name for the folder.
 * @returns The new immutable tree array with the folder renamed.
 */
export function renameFolder(
  forest: TreeItem[],
  id: string,
  newName: string,
): TreeItem[] {
  function rename(nodes: TreeItem[]): TreeItem[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id && isFolderNode(node)) {
        const newNodes = [...nodes];
        newNodes[i] = { ...node, name: newName };
        return newNodes;
      }
      if (isFolderNode(node) && node.children) {
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

/**
 * Creates and immutably adds a new empty folder inside a target parent.
 * 
 * @param forest The folder tree array.
 * @param parentFolderId The ID of the parent folder, or null to add at root level.
 * @param name The initial name for the newly created folder.
 * @returns An object containing the new immutable tree array and the unique ID generated for the new folder.
 */
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

/**
 * Collects the chain of ancestor folder IDs leading to a target node.
 * Useful for expanding parents to make a selected leaf node visible.
 * 
 * @param forest The folder tree array.
 * @param targetId The ID of the leaf/folder node to find ancestors for.
 * @returns An array of ancestor folder IDs (ordered top-to-bottom), or null if the target node is not found.
 */
export function collectAncestorIds(
  forest: TreeItem[],
  targetId: string,
): string[] | null {
  const path: string[] = [];
  const found = walkPath(forest, targetId, path);
  return found ? path : null;
}

/**
 * Helper DFS walk that accumulates parent folder IDs leading to a target node.
 */
function walkPath(nodes: TreeItem[], targetId: string, path: string[]): boolean {
  for (const node of nodes) {
    if (node.id === targetId) return true;
    if (isFolderNode(node) && node.children.length) {
      path.push(node.id);
      if (walkPath(node.children, targetId, path)) return true;
      path.pop();
    }
  }
  return false;
}

/**
 * Collects the IDs of all nodes in a given node's subtree (including the root node itself).
 * Precomputed during drag operations to disallow drops into a node's own descendants in O(1) time.
 * 
 * @param forest The folder tree array.
 * @param rootId The root ID of the subtree.
 * @returns A Set of all node IDs within the subtree.
 */
export function collectSubtreeIds(
  forest: TreeItem[],
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const loc = findLocation(forest, rootId);
  if (!loc) return out;
  out.add(rootId);
  if (isFolderNode(loc.node)) collectAllIds(loc.node.children, out);
  return out;
}

/**
 * Helper DFS recursion to collect all child IDs.
 */
function collectAllIds(nodes: TreeItem[], out: Set<string>): void {
  for (const n of nodes) {
    out.add(n.id);
    if (isFolderNode(n)) collectAllIds(n.children, out);
  }
}

/**
 * Represents a simplified folder choice in a dropdown or select list.
 */
export type FolderOption = {
  /** The folder's unique identifier. */
  id: string;
  /** The display label of the folder. */
  label: string;
  /** The nesting level/indentation depth of the folder. */
  depth: number;
};

/**
 * Traverses the folder tree to produce a flat list of folders as valid options for relocation,
 * automatically excluding a designated set of folder IDs (such as the source folder's subtree) to prevent cycles.
 * 
 * @param forest The folder tree array.
 * @param excludeIds Set of folder IDs to skip during traversal.
 * @returns A flat list of FolderOptions.
 */
export function flattenFolders(
  forest: TreeItem[],
  excludeIds: ReadonlySet<string>,
): FolderOption[] {
  const result: FolderOption[] = [];
  const walk = (nodes: TreeItem[], depth: number): void => {
    for (const node of nodes) {
      if (!isFolderNode(node) || excludeIds.has(node.id)) continue;
      result.push({ id: node.id, label: node.name, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(forest, 0);
  return result;
}

export const OTHERS_ROOT_ID = 'virtual-others-root';
export const OTHERS_USER_PREFIX = 'virtual-user-';

/**
 * Grouped layouts that do not reside within the main tree hierarchy.
 */
export type OrphanGroups = {
  /** Map of username to layout instances belonging to them. */
  othersByUsername: Record<string, LayoutInstance[]>;
  /** Sorted list of unique usernames having orphaned layouts. */
  othersUsernames: string[];
};

/**
 * Groups layout instances that are not bound in the session folder tree under their respective usernames.
 * Memoized outside the critical flattening functions to avoid re-walking thousands of files on simple UI expands.
 * 
 * @param layoutsById A dictionary of layout instances by their unique IDs.
 * @param sessionFileIds Set of file/layout IDs currently active in the real folder tree.
 * @returns Grouped orphan layouts structure.
 */
export function groupOrphanLayouts(
  layoutsById: Record<string, LayoutInstance>,
  sessionFileIds: ReadonlySet<string>,
): OrphanGroups {
  const othersByUsername: Record<string, LayoutInstance[]> = {};
  for (const layout of Object.values(layoutsById)) {
    if (sessionFileIds.has(layout.id)) continue;
    const uname = layout.username || 'Unknown User';
    (othersByUsername[uname] ??= []).push(layout);
  }
  return {
    othersByUsername,
    othersUsernames: Object.keys(othersByUsername).sort(),
  };
}

/**
 * Flattens the session hierarchy + orphan layouts ("Others" subtree) into a single sequential list
 * consumable by cdk-virtual-scroll. Automatically handles query filters, expanding matching ancestor paths,
 * and maintaining visual node depth.
 * 
 * @param sessions The master session tree array.
 * @param layoutsById A dictionary of all layout details.
 * @param orphanGroups Precomputed group of orphan layout instances.
 * @param expandedIds Set of manually expanded folder IDs in the UI.
 * @param filter The search query to filter rows by (case-insensitive).
 * @returns A flat list of visual rows ready for rendering.
 */
export function flattenSessions(
  sessions: TreeItem[],
  layoutsById: Record<string, LayoutInstance>,
  orphanGroups: OrphanGroups,
  expandedIds: ReadonlySet<string>,
  filter = '',
): FlatRowData[] {
  const query = filter.trim().toLowerCase();
  const result: FlatRowData[] = [];
  const { othersByUsername, othersUsernames } = orphanGroups;

  // Build the include set when filtering. A node is included if it or any descendant matches the query.
  let includeSet: Set<string> | null = null;
  if (query) {
    includeSet = new Set<string>();
    buildIncludeSet(sessions, layoutsById, query, includeSet);
    buildOthersIncludeSet(othersByUsername, query, includeSet);
  }

  const isExpanded = (id: string): boolean =>
    includeSet !== null ? includeSet.has(id) : expandedIds.has(id);

  // Walk the real sessions.
  const walk = (nodes: TreeItem[], depth: number): void => {
    for (const node of nodes) {
      if (includeSet && !includeSet.has(node.id)) continue;
      if (isFolderNode(node)) {
        const expanded = isExpanded(node.id);
        result.push({
          id: node.id,
          kind: 'folder',
          label: node.name,
          depth,
          expanded,
          hasChildren: node.children.length > 0,
        });
        if (expanded) walk(node.children, depth + 1);
      } else {
        // File node with no matching layout: skip it rather than render empty items
        const layout = layoutsById[node.id];
        if (!layout) continue;
        result.push({
          id: node.id,
          kind: 'file',
          label: layout.name,
          depth,
          expanded: false,
          hasChildren: false,
          layout,
        });
      }
    }
  };
  walk(sessions, 0);

  // Append "Others" virtual subtree if orphans exist and match the query.
  const othersIncluded =
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
        if (userExpanded) {
          for (const layout of othersByUsername[uname]) {
            if (includeSet && !includeSet.has(layout.id)) continue;
            result.push({
              id: layout.id,
              kind: 'file',
              label: layout.name,
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

/**
 * Traverses the folder tree once to return a set of all active file IDs.
 * Lifted out of flattenSessions to enable independent cache memoization.
 * 
 * @param sessions The sessions forest.
 * @returns A Set of all file IDs inside the main tree.
 */
export function collectSessionFileIds(sessions: TreeItem[]): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: TreeItem[]): void => {
    for (const n of nodes) {
      if (isFolderNode(n)) walk(n.children);
      else ids.add(n.id);
    }
  };
  walk(sessions);
  return ids;
}

/**
 * DFS helper to identify which nodes in the main tree match a query or have descendants matching the query.
 */
function buildIncludeSet(
  nodes: TreeItem[],
  layoutsById: Record<string, LayoutInstance>,
  query: string,
  out: Set<string>,
): boolean {
  let anyMatched = false;
  for (const node of nodes) {
    let matched = false;
    if (isFolderNode(node)) {
      const labelMatch = node.name.toLowerCase().includes(query);
      const childMatch = buildIncludeSet(node.children, layoutsById, query, out);
      matched = labelMatch || childMatch;
    } else {
      const layout = layoutsById[node.id];
      matched = matchesLayout(layout, query);
    }
    if (matched) {
      out.add(node.id);
      anyMatched = true;
    }
  }
  return anyMatched;
}

/**
 * DFS helper to check which orphan layout usernames or layout names match a search query.
 */
function buildOthersIncludeSet(
  othersByUsername: Record<string, LayoutInstance[]>,
  query: string,
  out: Set<string>,
): void {
  let anyMatched = false;
  for (const uname of Object.keys(othersByUsername)) {
    const userId = OTHERS_USER_PREFIX + uname;
    let userHas = uname.toLowerCase().includes(query);
    for (const layout of othersByUsername[uname]) {
      if (matchesLayout(layout, query)) {
        out.add(layout.id);
        userHas = true;
      }
    }
    if (userHas) {
      out.add(userId);
      anyMatched = true;
    }
  }
  if (anyMatched) out.add(OTHERS_ROOT_ID);
}

/**
 * Helper to match an individual layout instance's fields against a search query.
 */
function matchesLayout(layout: LayoutInstance | undefined, query: string): boolean {
  if (!layout) return false;
  if (layout.name.toLowerCase().includes(query)) return true;
  if (layout.username?.toLowerCase().includes(query)) return true;
  if (layout.description?.toLowerCase().includes(query)) return true;
  return false;
}

export type DropZone = 'before' | 'into' | 'after';

export type DropTarget = {
  rowIndex: number;
  zone: DropZone;
};

/**
 * Resolves a visual (rowIndex, drop zone) hit target into a structural parent ID and insertion index location.
 * Excludes the dragged source row ID from target sibling lists to ensure correct indices.
 * 
 * @param rows The flat list of all rows in the viewport.
 * @param target The resolved drop target row and sub-zone type.
 * @param sourceId The ID of the item being dragged.
 * @returns The destination parent folder ID (or null for root) and the sibling insertion index.
 */
export function resolveDropTarget(
  rows: FlatRowData[],
  target: DropTarget,
  sourceId: string,
): { parentId: string | null; index: number } {
  const targetRow = rows[target.rowIndex];

  if (target.zone === 'into') {
    return { parentId: targetRow.id, index: 0 };
  }

  let parentId: string | null = null;
  let siblingsBefore = 0;
  for (let i = target.rowIndex - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.depth < targetRow.depth) {
      parentId = row.id;
      break;
    }
    if (row.depth === targetRow.depth && row.id !== sourceId) siblingsBefore++;
  }

  return {
    parentId,
    index: target.zone === 'before' ? siblingsBefore : siblingsBefore + 1,
  };
}
