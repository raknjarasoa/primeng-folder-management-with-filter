import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderTreeStore } from './folder-tree.store';
import { TreeItem } from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';

function makeSessions(): TreeItem[] {
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
          children: [{ id: 'file-2', kind: 'file' }],
        },
      ],
    },
    { id: 'file-top', kind: 'file' },
  ];
}

function makeLayouts(): LayoutInstance[] {
  return [
    { id: 'file-1', name: 'Alpha Report', editable: true, username: '', description: '', tooltip: '' },
    { id: 'file-2', name: 'Beta Dashboard', editable: true, username: '', description: '', tooltip: '' },
    { id: 'file-top', name: 'Top Level File', editable: true, username: '', description: '', tooltip: '' },
  ];
}

describe('FolderTreeStore', () => {
  let store: InstanceType<typeof FolderTreeStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FolderTreeStore],
    });
    store = TestBed.inject(FolderTreeStore);
  });

  it('should initialize with correct default state', () => {
    expect(store.sessions()).toEqual([]);
    expect(store.layouts()).toEqual([]);
    expect(store.selectedFileId()).toBeNull();
    expect(store.filterText()).toBe('');
    expect(store.debouncedFilterText()).toBe('');
    expect(store.editingId()).toBeNull();
    expect(store.editingValue()).toBe('');
    expect(store.creatingId()).toBeNull();
    expect(store.expandedIds().size).toBe(0);
    expect(store.dropTarget()).toBeNull();
  });

  describe('Computed Properties', () => {
    beforeEach(() => {
      store.setSessions(makeSessions());
      store.setLayouts(makeLayouts());
    });

    it('should calculate layoutsById correctly', () => {
      const layoutsMap = store.layoutsById();
      expect(layoutsMap['file-1']).toBeDefined();
      expect(layoutsMap['file-1'].name).toBe('Alpha Report');
      expect(layoutsMap['file-2'].name).toBe('Beta Dashboard');
    });

    it('should derive selectedFileAncestors for session files', () => {
      store.setSelectedFileId('file-2');
      expect(store.selectedFileAncestors()).toEqual(['f-root', 'f-nested']);
    });

    it('should derive selectedFileAncestors for virtual/orphan files', () => {
      const orphanLayout: LayoutInstance = {
        id: 'file-orphan',
        name: 'Orphan Layout',
        editable: false,
        username: 'Alice Smith',
        description: '',
        tooltip: '',
      };
      store.setLayouts([...makeLayouts(), orphanLayout]);
      store.setSelectedFileId('file-orphan');

      expect(store.selectedFileAncestors()).toEqual(['virtual-others-root', 'virtual-user-Alice Smith']);
    });

    it('should calculate flatRows projection correctly', () => {
      const rows = store.flatRows();
      // Initially, nothing is expanded, so we only expect f-root and file-top (no virtual-others-root because makeLayouts contains no orphan layouts)
      expect(rows.map((r) => r.id)).toEqual(['f-root', 'file-top']);
    });

    it('should expand folders and recalculate flatRows projection', () => {
      store.expandFolder('f-root');
      const rows = store.flatRows();
      expect(rows.map((r) => r.id)).toEqual(['f-root', 'file-1', 'f-nested', 'file-top']);
    });
  });

  describe('Updaters and Methods', () => {
    beforeEach(() => {
      store.setSessions(makeSessions());
      store.setLayouts(makeLayouts());
    });

    it('should toggle, expand and collapse folders', () => {
      expect(store.expandedIds().has('f-root')).toBe(false);

      store.toggleExpand('f-root');
      expect(store.expandedIds().has('f-root')).toBe(true);

      store.collapseFolder('f-root');
      expect(store.expandedIds().has('f-root')).toBe(false);

      store.expandFolder('f-root');
      expect(store.expandedIds().has('f-root')).toBe(true);
    });

    it('should add a new folder at root', () => {
      const beforeCount = store.sessions().length;
      store.addFolder(null);

      expect(store.sessions().length).toBe(beforeCount + 1);
      expect(store.creatingId()).not.toBeNull();
      expect(store.editingId()).toBe(store.creatingId());
    });

    it('should add a subfolder and expand parent', () => {
      store.addFolder('f-root');

      expect(store.expandedIds().has('f-root')).toBe(true);
      expect(store.creatingId()).not.toBeNull();
    });

    it('should rename a folder and commit successfully', () => {
      store.startRename('f-root', 'Root Folder');
      expect(store.editingId()).toBe('f-root');
      expect(store.editingValue()).toBe('Root Folder');

      store.updateEditingValue('Awesome Folder');
      store.commitRename('f-root');

      expect(store.editingId()).toBeNull();
      const renamedRoot = store.sessions().find((s) => s.id === 'f-root');
      expect(renamedRoot?.name).toBe('Awesome Folder');
    });

    it('should cancel a rename and delete node if it was newly created', () => {
      const beforeCount = store.sessions().length;
      store.addFolder(null);
      const newId = store.creatingId()!;

      store.cancelRename();
      expect(store.editingId()).toBeNull();
      expect(store.creatingId()).toBeNull();
      expect(store.sessions().some((s) => s.id === newId)).toBe(false);
      expect(store.sessions().length).toBe(beforeCount);
    });

    it('should delete a node', () => {
      const beforeCount = store.sessions().length;
      store.deleteNode('file-top');

      expect(store.sessions().some((s) => s.id === 'file-top')).toBe(false);
      expect(store.sessions().length).toBe(beforeCount - 1);
    });

    it('should move a node', () => {
      // Move 'file-top' into 'f-nested'
      store.moveNode('file-top', 'f-nested');

      const root = store.sessions()[0];
      const nested = root.children?.find((c) => c.id === 'f-nested');
      expect(nested?.children?.some((c) => c.id === 'file-top')).toBe(true);
    });
  });

  describe('Search Query Debouncing', () => {
    it('should debounce search text query', async () => {
      store.updateFilterText('search-term');
      expect(store.debouncedFilterText()).toBe('');

      // Wait past the 300ms debounce window
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(store.debouncedFilterText()).toBe('search-term');
    });
  });
});
