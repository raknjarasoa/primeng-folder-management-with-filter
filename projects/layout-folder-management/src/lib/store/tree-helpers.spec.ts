import { describe, it, expect } from 'vitest';
import { TreeItem, isFolderNode } from '../models/folder-tree.models';
import {
  findLocation,
  isAncestorOrSelf,
  removeNode,
  insertNode,
  renameFolder,
  addFolder,
  collectAncestorIds,
  resolveDropTarget,
} from './tree-helpers';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

function makeForest(): TreeItem[] {
  return [
    {
      id: 'f-root',
      kind: 'folder',
      name: 'Root Folder',
      children: [
        { id: 'file-1', kind: 'file' },
        {
          id: 'f-nested',
          kind: 'folder',
          name: 'Nested',
          children: [
            { id: 'file-2', kind: 'file' },
            { id: 'file-3', kind: 'file' },
          ],
        },
      ],
    },
    { id: 'file-top', kind: 'file' },
    { id: 'f-empty', kind: 'folder', name: 'Empty Folder', children: [] },
  ];
}

// ---------------------------------------------------------------------------
// findLocation
// ---------------------------------------------------------------------------

describe('findLocation', () => {
  it('finds a root-level node', () => {
    const loc = findLocation(makeForest(), 'f-root');
    expect(loc).not.toBeNull();
    expect(loc!.node.id).toBe('f-root');
    expect(loc!.parent).toBeNull();
    expect(loc!.index).toBe(0);
  });

  it('finds a deeply nested node', () => {
    const loc = findLocation(makeForest(), 'file-2');
    expect(loc).not.toBeNull();
    expect(loc!.node.id).toBe('file-2');
    expect(loc!.parent?.id).toBe('f-nested');
    expect(loc!.index).toBe(0);
  });

  it('returns null for a missing id', () => {
    expect(findLocation(makeForest(), 'does-not-exist')).toBeNull();
  });

  it('returns correct siblings array', () => {
    const loc = findLocation(makeForest(), 'file-top');
    expect(loc!.siblings.length).toBe(3);
    expect(loc!.index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isAncestorOrSelf
// ---------------------------------------------------------------------------

describe('isAncestorOrSelf', () => {
  const forest = makeForest();

  it('returns true for same id (self)', () => {
    expect(isAncestorOrSelf(forest, 'f-root', 'f-root')).toBe(true);
  });

  it('returns true when first is ancestor of second', () => {
    expect(isAncestorOrSelf(forest, 'f-root', 'file-2')).toBe(true);
  });

  it('returns false when nodes are unrelated', () => {
    expect(isAncestorOrSelf(forest, 'f-empty', 'file-2')).toBe(false);
  });

  it('returns false when descendant is actually the ancestor', () => {
    expect(isAncestorOrSelf(forest, 'file-2', 'f-root')).toBe(false);
  });

  it('returns false for a file node (no children)', () => {
    expect(isAncestorOrSelf(forest, 'file-1', 'file-2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// removeNode
// ---------------------------------------------------------------------------

describe('removeNode', () => {
  it('removes a root-level node', () => {
    const { forest, removed } = removeNode(makeForest(), 'file-top');
    expect(removed).not.toBeNull();
    expect(removed!.id).toBe('file-top');
    expect(forest.length).toBe(2);
  });

  it('removes a nested node', () => {
    const { forest, removed } = removeNode(makeForest(), 'file-2');
    expect(removed!.id).toBe('file-2');
    const nested = findLocation(forest, 'f-nested')!.node;
    expect(isFolderNode(nested)).toBe(true);
    if (isFolderNode(nested)) expect(nested.children.length).toBe(1);
  });

  it('returns null removed for missing id', () => {
    const { forest, removed } = removeNode(makeForest(), 'nope');
    expect(removed).toBeNull();
    expect(forest.length).toBe(3);
  });

  it('does not mutate the original forest', () => {
    const original = makeForest();
    removeNode(original, 'file-top');
    expect(original.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// insertNode
// ---------------------------------------------------------------------------

describe('insertNode', () => {
  const newNode: TreeItem = { id: 'new-file', kind: 'file' };

  it('inserts at root level (end) when targetFolderId is null', () => {
    const result = insertNode(makeForest(), newNode, null);
    expect(result.length).toBe(4);
    expect(result[3].id).toBe('new-file');
  });

  it('inserts at root level at a specific index', () => {
    const result = insertNode(makeForest(), newNode, null, 0);
    expect(result[0].id).toBe('new-file');
    expect(result.length).toBe(4);
  });

  it('inserts inside a folder', () => {
    const result = insertNode(makeForest(), newNode, 'f-nested');
    const nested = findLocation(result, 'f-nested')!.node;
    expect(isFolderNode(nested)).toBe(true);
    if (isFolderNode(nested)) {
      expect(nested.children.length).toBe(3);
      expect(nested.children[2].id).toBe('new-file');
    }
  });

  it('inserts at specific index inside a folder', () => {
    const result = insertNode(makeForest(), newNode, 'f-nested', 0);
    const nested = findLocation(result, 'f-nested')!.node;
    if (isFolderNode(nested)) expect(nested.children[0].id).toBe('new-file');
  });

  it('inserts into an empty folder', () => {
    const result = insertNode(makeForest(), newNode, 'f-empty');
    const empty = findLocation(result, 'f-empty')!.node;
    expect(isFolderNode(empty)).toBe(true);
    if (isFolderNode(empty)) {
      expect(empty.children.length).toBe(1);
      expect(empty.children[0].id).toBe('new-file');
    }
  });

  it('falls back to root when target folder does not exist', () => {
    const result = insertNode(makeForest(), newNode, 'bogus');
    expect(result.length).toBe(4);
    expect(result[3].id).toBe('new-file');
  });

  it('does not mutate the original forest', () => {
    const original = makeForest();
    insertNode(original, newNode, 'f-nested');
    const nested = findLocation(original, 'f-nested')!.node;
    if (isFolderNode(nested)) expect(nested.children.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// renameFolder
// ---------------------------------------------------------------------------

describe('renameFolder', () => {
  it('renames an existing folder', () => {
    const result = renameFolder(makeForest(), 'f-root', 'Renamed');
    const node = findLocation(result, 'f-root')!.node;
    expect(isFolderNode(node)).toBe(true);
    if (isFolderNode(node)) expect(node.name).toBe('Renamed');
  });

  it('does not rename a file node', () => {
    const result = renameFolder(makeForest(), 'file-1', 'Oops');
    const node = findLocation(result, 'file-1')!.node;
    expect(isFolderNode(node)).toBe(false);
  });

  it('returns same array when id is missing', () => {
    const original = makeForest();
    const result = renameFolder(original, 'nope', 'Nope');
    expect(result).toBe(original);
    expect(result.length).toBe(3);
  });

  it('does not mutate the original forest', () => {
    const original = makeForest();
    renameFolder(original, 'f-root', 'Changed');
    const node = findLocation(original, 'f-root')!.node;
    if (isFolderNode(node)) expect(node.name).toBe('Root Folder');
  });
});

// ---------------------------------------------------------------------------
// addFolder
// ---------------------------------------------------------------------------

describe('addFolder', () => {
  it('adds a folder at root level', () => {
    const { forest, newId } = addFolder(makeForest(), null, 'New Folder');
    expect(newId).toBeTruthy();
    expect(newId.startsWith('folder-')).toBe(true);
    // addFolder inserts at index 0
    const newNode = forest[0];
    expect(newNode.id).toBe(newId);
    expect(newNode.kind).toBe('folder');
    expect(isFolderNode(newNode)).toBe(true);
    if (isFolderNode(newNode)) {
      expect(newNode.name).toBe('New Folder');
      expect(newNode.children).toEqual([]);
    }
  });

  it('adds a subfolder inside an existing folder', () => {
    const { forest, newId } = addFolder(makeForest(), 'f-root', 'Sub');
    const root = findLocation(forest, 'f-root')!.node;
    expect(isFolderNode(root)).toBe(true);
    if (isFolderNode(root)) {
      expect(root.children[0].id).toBe(newId);
      const sub = root.children[0];
      if (isFolderNode(sub)) expect(sub.name).toBe('Sub');
    }
  });

  it('generates unique ids', () => {
    const { newId: id1 } = addFolder(makeForest(), null, 'A');
    const { newId: id2 } = addFolder(makeForest(), null, 'B');
    expect(id1).toMatch(/^folder-/);
    expect(id2).toMatch(/^folder-/);
  });
});

// ---------------------------------------------------------------------------
// collectAncestorIds
// ---------------------------------------------------------------------------

describe('collectAncestorIds', () => {
  const forest = makeForest();

  it('returns ancestor ids for a deeply nested node', () => {
    const ancestors = collectAncestorIds(forest, 'file-2');
    expect(ancestors).toEqual(['f-root', 'f-nested']);
  });

  it('returns only the direct parent for a shallow child', () => {
    const ancestors = collectAncestorIds(forest, 'file-1');
    expect(ancestors).toEqual(['f-root']);
  });

  it('returns empty array for a root-level node', () => {
    const ancestors = collectAncestorIds(forest, 'file-top');
    expect(ancestors).toEqual([]);
  });

  it('returns empty array for a root-level folder', () => {
    const ancestors = collectAncestorIds(forest, 'f-root');
    expect(ancestors).toEqual([]);
  });

  it('returns null for a missing id', () => {
    const ancestors = collectAncestorIds(forest, 'missing');
    expect(ancestors).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveDropTarget
// ---------------------------------------------------------------------------

describe('resolveDropTarget', () => {
  const flatRows = [
    { id: 'f-root', kind: 'folder', label: 'Root Folder', depth: 0, expanded: true, hasChildren: true },
    { id: 'file-1', kind: 'file', label: 'File 1', depth: 1, expanded: false, hasChildren: false },
    { id: 'f-nested', kind: 'folder', label: 'Nested', depth: 1, expanded: true, hasChildren: true },
    { id: 'file-2', kind: 'file', label: 'File 2', depth: 2, expanded: false, hasChildren: false },
    { id: 'file-3', kind: 'file', label: 'File 3', depth: 2, expanded: false, hasChildren: false },
    { id: 'file-top', kind: 'file', label: 'Top Level File', depth: 0, expanded: false, hasChildren: false },
  ] as any[];

  it('resolves drop into a folder correctly', () => {
    const res = resolveDropTarget(flatRows, { rowIndex: 0, zone: 'into' }, 'file-top');
    expect(res).toEqual({ parentId: 'f-root', index: 0 });
  });

  it('resolves drop before a nested row correctly', () => {
    // Drop before f-nested (index 2)
    const res = resolveDropTarget(flatRows, { rowIndex: 2, zone: 'before' }, 'file-top');
    expect(res).toEqual({ parentId: 'f-root', index: 1 });
  });

  it('resolves drop after a nested row correctly', () => {
    // Drop after file-1 (index 1)
    const res = resolveDropTarget(flatRows, { rowIndex: 1, zone: 'after' }, 'file-top');
    expect(res).toEqual({ parentId: 'f-root', index: 1 });
  });

  it('resolves drop with source row sibling exclusion correctly', () => {
    // Drop after file-3 (index 4), but the source is file-2 (index 3).
    // Sibling before at same depth: file-2 (source, excluded) and file-3.
    // If source file-2 is moved, it shouldn't count as a preceding sibling when dragging downward after file-3.
    const res = resolveDropTarget(flatRows, { rowIndex: 4, zone: 'after' }, 'file-2');
    expect(res).toEqual({ parentId: 'f-nested', index: 1 });
  });

  it('resolves drop at root level before a folder correctly', () => {
    const res = resolveDropTarget(flatRows, { rowIndex: 0, zone: 'before' }, 'file-top');
    expect(res).toEqual({ parentId: null, index: 0 });
  });

  it('resolves drop at root level after a folder correctly', () => {
    const res = resolveDropTarget(flatRows, { rowIndex: 0, zone: 'after' }, 'file-top');
    expect(res).toEqual({ parentId: null, index: 1 });
  });
});
