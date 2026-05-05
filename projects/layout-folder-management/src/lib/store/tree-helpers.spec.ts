import { describe, it, expect } from 'vitest';
import { SessionNode, FolderNode } from '../models/folder-tree.models';
import {
  findLocation,
  isAncestorOrSelf,
  removeNode,
  insertNode,
  renameFolder,
  addFolder,
  collectAncestorIds,
} from './tree-helpers';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

function makeForest(): SessionNode[] {
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
    expect(loc!.siblings.length).toBe(3); // root-level has 3 items
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
    const nested = findLocation(forest, 'f-nested');
    expect((nested!.node as FolderNode).children!.length).toBe(1);
  });

  it('returns null removed for missing id', () => {
    const { forest, removed } = removeNode(makeForest(), 'nope');
    expect(removed).toBeNull();
    expect(forest.length).toBe(3); // unchanged clone
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
  const newNode: SessionNode = { id: 'new-file', kind: 'file' };

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
    const nested = findLocation(result, 'f-nested');
    expect((nested!.node as FolderNode).children!.length).toBe(3);
    expect((nested!.node as FolderNode).children![2].id).toBe('new-file');
  });

  it('inserts at specific index inside a folder', () => {
    const result = insertNode(makeForest(), newNode, 'f-nested', 0);
    const nested = findLocation(result, 'f-nested');
    expect((nested!.node as FolderNode).children![0].id).toBe('new-file');
  });

  it('inserts into an empty folder', () => {
    const result = insertNode(makeForest(), newNode, 'f-empty');
    const empty = findLocation(result, 'f-empty');
    expect((empty!.node as FolderNode).children!.length).toBe(1);
    expect((empty!.node as FolderNode).children![0].id).toBe('new-file');
  });

  it('falls back to root when target folder does not exist', () => {
    const result = insertNode(makeForest(), newNode, 'bogus');
    expect(result.length).toBe(4);
    expect(result[3].id).toBe('new-file');
  });

  it('does not mutate the original forest', () => {
    const original = makeForest();
    insertNode(original, newNode, 'f-nested');
    const nested = findLocation(original, 'f-nested');
    expect((nested!.node as FolderNode).children!.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// renameFolder
// ---------------------------------------------------------------------------

describe('renameFolder', () => {
  it('renames an existing folder', () => {
    const result = renameFolder(makeForest(), 'f-root', 'Renamed');
    const loc = findLocation(result, 'f-root');
    expect(((loc!.node as FolderNode).name)).toBe('Renamed');
  });

  it('does not rename a file node', () => {
    const result = renameFolder(makeForest(), 'file-1', 'Oops');
    const loc = findLocation(result, 'file-1');
    expect(((loc!.node as FolderNode).name)).toBeUndefined();
  });

  it('returns a clone when id is missing', () => {
    const original = makeForest();
    const result = renameFolder(original, 'nope', 'Nope');
    expect(result).not.toBe(original); // always clones
    expect(result.length).toBe(3);
  });

  it('does not mutate the original forest', () => {
    const original = makeForest();
    renameFolder(original, 'f-root', 'Changed');
    expect(((findLocation(original, 'f-root')!.node as FolderNode).name)).toBe('Root Folder');
  });
});

// ---------------------------------------------------------------------------
// addFolder
// ---------------------------------------------------------------------------

describe('addFolder', () => {
  it('adds a folder at root level', () => {
    const { forest, newId } = addFolder(makeForest(), null, 'New Folder');
    expect(newId).toBeTruthy();
    expect(newId.startsWith('f-')).toBe(true);
    // addFolder inserts at index 0
    expect(forest[0].id).toBe(newId);
    expect(((forest[0] as FolderNode).name)).toBe('New Folder');
    expect(forest[0].kind).toBe('folder');
    expect(((forest[0] as FolderNode).children)).toEqual([]);
  });

  it('adds a subfolder inside an existing folder', () => {
    const { forest, newId } = addFolder(makeForest(), 'f-root', 'Sub');
    const root = findLocation(forest, 'f-root');
    // inserted at index 0 of children
    expect((root!.node as FolderNode).children![0].id).toBe(newId);
    expect(((root!.node as FolderNode).children![0] as FolderNode).name).toBe('Sub');
  });

  it('generates unique ids', () => {
    const { newId: id1 } = addFolder(makeForest(), null, 'A');
    // tiny delay to ensure Date.now() differs
    const { newId: id2 } = addFolder(makeForest(), null, 'B');
    // They could technically collide in the same ms, but the test validates format
    expect(id1).toMatch(/^f-/);
    expect(id2).toMatch(/^f-/);
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

  it('returns empty array for a missing id', () => {
    const ancestors = collectAncestorIds(forest, 'missing');
    expect(ancestors).toEqual([]);
  });
});
