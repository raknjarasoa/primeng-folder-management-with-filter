import {
  FlatRowData,
  TreeItem,
  isFolderNode,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';

export interface NodeLocation {
  node: TreeItem;
  parent: TreeItem | null;
  index: number;
  siblings: TreeItem[];
}

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

  const newForest = rename(forest);
  return newForest;
}

export function addFolder(
  forest: TreeItem[],
  parentFolderId: string | null,
  name: string,
): { forest: TreeItem[]; newId: string } {
  const newId = `f-${Date.now().toString(36)}`;
  const folder: TreeItem = { id: newId, kind: 'folder', name, children: [] };
  return { forest: insertNode(forest, folder, parentFolderId, 0), newId };
}

export function collectAncestorIds(
  forest: TreeItem[],
  targetId: string,
): string[] | null {
  const path: string[] = [];
  return walkPath(forest, targetId, path) ? path : null;
}

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

// Collects the IDs of all nodes inside `rootId`'s subtree (including rootId
// itself). Used during drag to disallow dropping a folder into its own
// descendants in O(1) lookups rather than an O(N) tree walk per move event.
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

function collectAllIds(nodes: TreeItem[], out: Set<string>): void {
  for (const n of nodes) {
    out.add(n.id);
    if (isFolderNode(n)) collectAllIds(n.children, out);
  }
}

// Flattens the session tree (+ orphan-layouts "Others" subtree) into the
// single list cdk-virtual-scroll consumes. When `filter` is non-empty, only
// nodes whose label/metadata match, plus their ancestors, are emitted, and
// matching subtrees are force-expanded so matches are visible.
export const OTHERS_ROOT_ID = 'others-root';
const OTHERS_USER_PREFIX = 'others-';

export function flattenSessions(
  sessions: TreeItem[],
  layoutsById: Record<string, LayoutInstance>,
  expandedIds: ReadonlySet<string>,
  filter = '',
): FlatRowData[] {
  const query = filter.trim().toLowerCase();
  const result: FlatRowData[] = [];

  // Group orphan layouts by username for the "Others" subtree.
  const sessionFileIds = collectSessionFileIds(sessions);
  const othersByUsername: Record<string, LayoutInstance[]> = {};
  for (const layout of Object.values(layoutsById)) {
    if (!sessionFileIds.has(layout.id)) {
      const uname = layout.username || 'Unknown User';
      (othersByUsername[uname] ??= []).push(layout);
    }
  }
  const othersUsernames = Object.keys(othersByUsername).sort();

  // Build the include set when filtering. A node is included if it (or any
  // descendant) matches the query.
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
        // File node with no matching layout: skip it entirely rather than
        // render a placeholder row.
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

  // Append "Others" virtual subtree, if any orphans exist and (when filtering)
  // anything inside matches.
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

function collectSessionFileIds(sessions: TreeItem[]): Set<string> {
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

function matchesLayout(layout: LayoutInstance | undefined, query: string): boolean {
  if (!layout) return false;
  if (layout.name.toLowerCase().includes(query)) return true;
  if (layout.username?.toLowerCase().includes(query)) return true;
  if (layout.description?.toLowerCase().includes(query)) return true;
  return false;
}
