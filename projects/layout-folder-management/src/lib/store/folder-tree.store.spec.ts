import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, inject } from '@angular/core';

import { FolderTreeStore } from './folder-tree.store';
import { SessionNode, FolderNode, Layout } from '../models/folder-tree.models';

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

function makeLayouts(): Layout[] {
  return [
    { id: 'v-001', name: 'EUR/USD', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'v-002', name: 'CAC 40', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'v-003', name: 'Daily P&L', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
  ];
}

// ---------------------------------------------------------------------------
// Helper: create store instance via a host component
// ---------------------------------------------------------------------------
// signalStore is component-scoped, so we need a host component to instantiate it.

@Component({
  standalone: true,
  template: '',
  providers: [FolderTreeStore],
})
class TestHost {
  store = inject(FolderTreeStore);
}

describe('FolderTreeStore', () => {
  let store: InstanceType<typeof FolderTreeStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);
    store = fixture.componentInstance.store;
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
  // treeNodes (computed projection)
  // -----------------------------------------------------------------------

  describe('treeNodes', () => {
    it('projects sessions + layouts into TreeNode[]', () => {
      store.initData(makeSessions(), makeLayouts());
      const nodes = store.treeNodes();

      expect(nodes.length).toBe(2);
      // First node is a folder
      expect(nodes[0].label).toBe('Trading');
      expect(nodes[0].data?.kind).toBe('folder');
      expect(nodes[0].children?.length).toBe(2);
      // File node label comes from layout
      expect(nodes[0].children![0].label).toBe('EUR/USD');
      expect(nodes[0].children![0].data?.kind).toBe('file');
    });

    it('shows placeholder label when layout is missing', () => {
      const sessions: SessionNode[] = [{ id: 'orphan', kind: 'file' }];
      store.initData(sessions, []);
      const nodes = store.treeNodes();

      expect(nodes[0].label).toContain('missing layout');
    });

    it('shows "(untitled folder)" for folder without name', () => {
      const sessions: SessionNode[] = [
        { id: 'f1', kind: 'folder', name: '', children: [] },
      ];
      store.initData(sessions, []);
      const nodes = store.treeNodes();

      expect(nodes[0].label).toBe('(untitled folder)');
    });

    it('sets droppable=true for folders and droppable=false for files', () => {
      store.initData(makeSessions(), makeLayouts());
      const nodes = store.treeNodes();

      expect(nodes[0].droppable).toBe(true); // folder
      expect(nodes[1].droppable).toBe(false); // file
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

      const ancestors = store.selectedFileAncestors();
      expect(ancestors).toEqual(['f-trading', 'f-equity']);
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

      const sessions = store.sessions();
      expect(sessions[0].id).toBe('v-001');
    });

    it('moves a file into a different folder', () => {
      store.initData(makeSessions(), makeLayouts());
      store.moveNode('v-003', 'f-equity');

      const equity = (store.sessions()[0] as FolderNode).children!.find(c => c.id === 'f-equity')!;
      expect(((equity as FolderNode).children)!.some(c => c.id === 'v-003')).toBe(true);
    });

    it('prevents cycle (folder into itself)', () => {
      store.initData(makeSessions(), makeLayouts());
      const before = structuredClone(store.sessions());
      store.moveNode('f-trading', 'f-equity');

      // Sessions should be unchanged
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

      expect(store.sessions().length).toBe(1); // only f-trading remains at root
    });

    it('deletes a nested node', () => {
      store.initData(makeSessions(), makeLayouts());
      store.deleteNode('v-001');

      const trading = store.sessions()[0];
      expect(((trading as FolderNode).children)!.length).toBe(1); // only f-equity
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

      expect(((store.sessions()[0] as FolderNode).name)).toBe('Renamed');
    });

    it('trims whitespace', () => {
      store.initData(makeSessions(), makeLayouts());
      store.renameFolder('f-trading', '  Trimmed  ');

      expect(((store.sessions()[0] as FolderNode).name)).toBe('Trimmed');
    });

    it('ignores empty name', () => {
      store.initData(makeSessions(), makeLayouts());
      store.renameFolder('f-trading', '   ');

      expect(((store.sessions()[0] as FolderNode).name)).toBe('Trading');
    });
  });

  // -----------------------------------------------------------------------
  // addFolder
  // -----------------------------------------------------------------------

  describe('addFolder', () => {
    it('adds a folder at root level', () => {
      store.initData(makeSessions(), makeLayouts());
      const newId = store.addFolder(null, 'New Folder');

      expect(newId).toBeTruthy();
      expect(store.sessions()[0].id).toBe(newId);
      expect(((store.sessions()[0] as FolderNode).name)).toBe('New Folder');
    });

    it('adds a subfolder inside an existing folder', () => {
      store.initData(makeSessions(), makeLayouts());
      const newId = store.addFolder('f-trading', 'Subfolder');

      const trading = store.sessions()[0];
      expect(((trading as FolderNode).children)![0].id).toBe(newId);
      expect((((trading as FolderNode).children)![0] as FolderNode).name).toBe('Subfolder');
    });
  });
});
