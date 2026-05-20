import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, inject } from '@angular/core';

import { FolderTreeStore } from './folder-tree.store';
import { SessionNode, LayoutInstance, isFolderNode } from '../models/folder-tree.models';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

function makeSessions(): SessionNode[] {
  return [
    {
      id: 'f-trading',
      kind: 'folder',
      name: 'Trading',
      children: [
        { id: 'v-001', kind: 'file' },
        {
          id: 'f-equity',
          kind: 'folder',
          name: 'Equity',
          children: [
            { id: 'v-002', kind: 'file' },
          ],
        },
      ],
    },
    { id: 'v-003', kind: 'file' },
  ];
}

function makeLayouts(): LayoutInstance[] {
  return [
    { id: 'v-001', name: 'EUR/USD', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'v-002', name: 'CAC 40', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'v-003', name: 'Daily P&L', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
  ];
}

// ---------------------------------------------------------------------------
// Helper: create store instance via a host component
// ---------------------------------------------------------------------------

@Component({ standalone: true, template: '', providers: [FolderTreeStore] })
class TestHost {
  store = inject(FolderTreeStore);
}

describe('FolderTreeStore', () => {
  let store: InstanceType<typeof FolderTreeStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    store = TestBed.createComponent(TestHost).componentInstance.store;
  });

  // -----------------------------------------------------------------------
  // initData
  // -----------------------------------------------------------------------

  describe('initData', () => {
    it('populates sessions and layoutsById', () => {
      store.initData(makeSessions(), makeLayouts());
      expect(store.sessions().length).toBe(2);
      expect(Object.keys(store.layoutsById()).length).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // treeNodes
  // -----------------------------------------------------------------------

  describe('treeNodes', () => {
    it('projects sessions + layouts into TreeNode[]', () => {
      store.initData(makeSessions(), makeLayouts());
      const nodes = store.treeNodes();

      expect(nodes.length).toBe(2);
      expect(nodes[0].label).toBe('Trading');
      expect(nodes[0].data?.kind).toBe('folder');
      expect(nodes[0].children?.length).toBe(2);
      expect(nodes[0].children![0].label).toBe('EUR/USD');
      expect(nodes[0].children![0].data?.kind).toBe('file');
    });

    it('shows placeholder label when layout is missing', () => {
      const sessions: SessionNode[] = [{ id: 'orphan', kind: 'file' }];
      store.initData(sessions, []);
      expect(store.treeNodes()[0].label).toContain('missing layout');
    });

    it('sets droppable=true for folders and droppable=false for files', () => {
      store.initData(makeSessions(), makeLayouts());
      const nodes = store.treeNodes();
      expect(nodes[0].droppable).toBe(true);
      expect(nodes[1].droppable).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // selectFile
  // -----------------------------------------------------------------------

  describe('selectFile', () => {
    it('sets the selectedFileId', () => {
      store.selectFile('v-001');
      expect(store.selectedFileId()).toBe('v-001');
    });

    it('clears with null', () => {
      store.selectFile('v-001');
      store.selectFile(null);
      expect(store.selectedFileId()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // selectedFileAncestors
  // -----------------------------------------------------------------------

  describe('selectedFileAncestors', () => {
    it('returns ancestor folder ids for a selected file', () => {
      store.initData(makeSessions(), makeLayouts());
      store.selectFile('v-002');
      expect(store.selectedFileAncestors()).toEqual(['f-trading', 'f-equity']);
    });

    it('returns empty array when no file selected', () => {
      store.initData(makeSessions(), makeLayouts());
      expect(store.selectedFileAncestors()).toEqual([]);
    });

    it('returns empty array for a root-level file', () => {
      store.initData(makeSessions(), makeLayouts());
      store.selectFile('v-003');
      expect(store.selectedFileAncestors()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // moveNode
  // -----------------------------------------------------------------------

  describe('moveNode', () => {
    it('moves a file to root level', () => {
      store.initData(makeSessions(), makeLayouts());
      store.moveNode('v-001', null, 0);
      expect(store.sessions()[0].id).toBe('v-001');
    });

    it('moves a file into a different folder', () => {
      store.initData(makeSessions(), makeLayouts());
      store.moveNode('v-003', 'f-equity');
      const trading = store.sessions()[0];
      expect(isFolderNode(trading)).toBe(true);
      if (isFolderNode(trading)) {
        const equity = trading.children.find((c) => c.id === 'f-equity');
        expect(equity).toBeDefined();
        if (equity && isFolderNode(equity)) {
          expect(equity.children.some((c) => c.id === 'v-003')).toBe(true);
        }
      }
    });

    it('prevents cycle (folder into itself)', () => {
      store.initData(makeSessions(), makeLayouts());
      const before = structuredClone(store.sessions());
      store.moveNode('f-trading', 'f-equity');
      expect(store.sessions()).toEqual(before);
    });

    it('does nothing for non-existent node', () => {
      store.initData(makeSessions(), makeLayouts());
      const before = structuredClone(store.sessions());
      store.moveNode('nope', null);
      expect(store.sessions()).toEqual(before);
    });
  });

  // -----------------------------------------------------------------------
  // deleteNode
  // -----------------------------------------------------------------------

  describe('deleteNode', () => {
    it('deletes a node from the tree', () => {
      store.initData(makeSessions(), makeLayouts());
      store.deleteNode('v-003');
      expect(store.sessions().length).toBe(1);
    });

    it('deletes a nested node', () => {
      store.initData(makeSessions(), makeLayouts());
      store.deleteNode('v-001');
      const trading = store.sessions()[0];
      expect(isFolderNode(trading)).toBe(true);
      if (isFolderNode(trading)) expect(trading.children.length).toBe(1);
    });

    it('clears selectedFileId when the selected node is deleted', () => {
      store.initData(makeSessions(), makeLayouts());
      store.selectFile('v-001');
      store.deleteNode('v-001');
      expect(store.selectedFileId()).toBeNull();
    });

    it('preserves selectedFileId when a different node is deleted', () => {
      store.initData(makeSessions(), makeLayouts());
      store.selectFile('v-001');
      store.deleteNode('v-003');
      expect(store.selectedFileId()).toBe('v-001');
    });
  });

  // -----------------------------------------------------------------------
  // renameFolder
  // -----------------------------------------------------------------------

  describe('renameFolder', () => {
    it('renames a folder', () => {
      store.initData(makeSessions(), makeLayouts());
      store.renameFolder('f-trading', 'Renamed');
      const node = store.sessions()[0];
      expect(isFolderNode(node)).toBe(true);
      if (isFolderNode(node)) expect(node.name).toBe('Renamed');
    });

    it('trims whitespace', () => {
      store.initData(makeSessions(), makeLayouts());
      store.renameFolder('f-trading', '  Trimmed  ');
      const node = store.sessions()[0];
      if (isFolderNode(node)) expect(node.name).toBe('Trimmed');
    });

    it('ignores empty name', () => {
      store.initData(makeSessions(), makeLayouts());
      store.renameFolder('f-trading', '   ');
      const node = store.sessions()[0];
      if (isFolderNode(node)) expect(node.name).toBe('Trading');
    });
  });

  // -----------------------------------------------------------------------
  // addFolder
  // -----------------------------------------------------------------------

  describe('addFolder', () => {
    it('adds a folder at root level', () => {
      store.initData(makeSessions(), makeLayouts());
      const newId = store.addFolder(null, 'New Folder');
      const newNode = store.sessions()[0];
      expect(newId).toBeTruthy();
      expect(newNode.id).toBe(newId);
      expect(isFolderNode(newNode)).toBe(true);
      if (isFolderNode(newNode)) expect(newNode.name).toBe('New Folder');
    });

    it('adds a subfolder inside an existing folder', () => {
      store.initData(makeSessions(), makeLayouts());
      const newId = store.addFolder('f-trading', 'Subfolder');
      const trading = store.sessions()[0];
      expect(isFolderNode(trading)).toBe(true);
      if (isFolderNode(trading)) {
        expect(trading.children[0].id).toBe(newId);
        const sub = trading.children[0];
        if (isFolderNode(sub)) expect(sub.name).toBe('Subfolder');
      }
    });
  });
});
