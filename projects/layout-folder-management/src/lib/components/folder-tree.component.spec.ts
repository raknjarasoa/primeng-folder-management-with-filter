import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FolderTreeComponent } from './folder-tree.component';
import { SessionNode, Layout, isFolder } from '../models/folder-tree.models';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeSessions(): SessionNode[] {
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

function makeLayouts(): Layout[] {
  return [
    { id: 'file-1', name: 'Alpha Report', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'file-2', name: 'Beta Dashboard', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'file-top', name: 'Top Level File', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
  ];
}

// ---------------------------------------------------------------------------
// Component integration tests
// ---------------------------------------------------------------------------

describe('FolderTreeComponent', () => {
  let fixture: ComponentFixture<FolderTreeComponent>;
  let component: FolderTreeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FolderTreeComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderTreeComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('sessions', []);
    fixture.componentRef.setInput('selectedFileId', null);
  });

  // -----------------------------------------------------------------------
  // Creation & basic rendering
  // -----------------------------------------------------------------------

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render tree nodes when inputs are set', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.treeValue().length).toBeGreaterThan(0);
  });

  it('should project correct labels from layouts', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const nodes = component.treeValue();
    expect(nodes[0].label).toBe('Root Folder');
    expect(nodes[1].label).toBe('Top Level File');
  });

  // -----------------------------------------------------------------------
  // File selection
  // -----------------------------------------------------------------------

  it('should set selectedNode when selectedFileId input is provided', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.selectedNode()?.key).toBe('file-1');
  });

  it('should auto-expand ancestor folders for a selected file', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.treeValue()[0].expanded).toBe(true);
  });

  it('should return null selectedNode when no file is selected', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.selectedNode()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  it('should filter tree nodes by search text', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['filterText'].set('alpha');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 350));

    const allLabels = flattenLabels(component.treeValue());
    expect(allLabels).toContain('Alpha Report');
    expect(allLabels).not.toContain('Top Level File');
  });

  it('should expand all nodes when filtering', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['filterText'].set('beta');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 350));

    for (const n of component.treeValue()) {
      if (n.children?.length) expect(n.expanded).toBe(true);
    }
  });

  it('should return empty tree when filter matches nothing', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['filterText'].set('zzzzzzzzz');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 350));

    expect(component.treeValue().length).toBe(0);
    expect(component['isFiltering']()).toBe(true);
  });

  it('should disable drag/drop when filtering', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['filterText'].set('alpha');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 350));

    expect(component['isFiltering']()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Rename flow
  // -----------------------------------------------------------------------

  it('should enter rename mode via startRename', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['startRename']('f-root', 'Root Folder');

    expect(component['editingId']()).toBe('f-root');
    expect(component['editingValue']()).toBe('Root Folder');
  });

  it('should commit rename and update the store', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('New Name');
    component['commitRename']('f-root');

    expect(component['editingId']()).toBeNull();
    const session = component.store.sessions()[0];
    expect(isFolder(session)).toBe(true);
    if (isFolder(session)) expect(session.name).toBe('New Name');
  });

  it('should not commit rename with empty name', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('   ');
    component['commitRename']('f-root');

    expect(component['editingId']()).toBe('f-root');
    const session = component.store.sessions()[0];
    if (isFolder(session)) expect(session.name).toBe('Root Folder');
  });

  // -----------------------------------------------------------------------
  // Add folder flow
  // -----------------------------------------------------------------------

  it('should add folder at root and enter editing mode', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sessionsBefore = component.store.sessions().length;
    component['onAddFolder']();

    expect(component.store.sessions().length).toBe(sessionsBefore + 1);
    expect(component['editingId']()).not.toBeNull();
    expect(component['creatingId']()).not.toBeNull();
  });

  it('should remove ephemeral folder on cancel', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sessionsBefore = component.store.sessions().length;
    component['onAddFolder']();
    const newId = component['creatingId']()!;
    component['cancelRename'](newId);

    expect(component.store.sessions().length).toBe(sessionsBefore);
    expect(component['editingId']()).toBeNull();
    expect(component['creatingId']()).toBeNull();
  });

  it('should add subfolder inside a parent folder', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const first = component.store.sessions()[0];
    expect(isFolder(first)).toBe(true);
    if (!isFolder(first)) return;

    const childrenBefore = first.children.length;
    component['onAddFolder']('f-root');

    const updated = component.store.sessions()[0];
    if (isFolder(updated)) {
      expect(updated.children.length).toBe(childrenBefore + 1);
    }
    expect(component['editingId']()).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Delete flow
  // -----------------------------------------------------------------------

  it('should call confirmationService.confirm on delete', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const confirmSpy = vi.spyOn(component['confirmationService'], 'confirm');
    component['onDelete']({ id: 'file-top', kind: 'file' });

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(confirmSpy.mock.calls[0][0].header).toBe('Confirm Deletion');
  });

  // -----------------------------------------------------------------------
  // Move to folder overlay
  // -----------------------------------------------------------------------

  describe('Move to folder', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('sessions', makeSessions());
      fixture.componentRef.setInput('layouts', makeLayouts());
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('moveDestinationNodes contains only folders', () => {
      component['movingNodeId'].set('file-1');
      const nodes = component['moveDestinationNodes']();

      const allFolders = (list: any[]): boolean =>
        list.every((n) => n.data?.kind === 'folder' && (!n.children || allFolders(n.children)));

      expect(allFolders(nodes)).toBe(true);
    });

    it('excludes the source folder (and its descendants) from destinations', () => {
      component['movingNodeId'].set('f-root');
      const nodes = component['moveDestinationNodes']();

      const containsKey = (list: any[], key: string): boolean =>
        list.some((n) => n.key === key || (n.children && containsKey(n.children, key)));

      expect(containsKey(nodes, 'f-root')).toBe(false);
      expect(containsKey(nodes, 'f-nested')).toBe(false);
    });

    it('moves a file into the picked folder via onMoveDestinationSelected', () => {
      component['movingNodeId'].set('file-top');
      component['onMoveDestinationSelected']({
        originalEvent: new MouseEvent('click'),
        node: { key: 'f-root', data: { id: 'f-root', kind: 'folder' } } as any,
      });

      const root = component.store.sessions().find((s) => s.id === 'f-root');
      expect(root).toBeDefined();
      if (root && isFolder(root)) {
        expect(root.children.some((c) => c.id === 'file-top')).toBe(true);
      }
      expect(component['movingNodeId']()).toBeNull();
    });

    it('moves a node to root level via onMoveToRoot', () => {
      component['movingNodeId'].set('file-1');
      const rootCountBefore = component.store.sessions().length;

      component['onMoveToRoot']();

      const rootSessions = component.store.sessions();
      expect(rootSessions.length).toBe(rootCountBefore + 1);
      expect(rootSessions.some((s) => s.id === 'file-1')).toBe(true);
      expect(component['movingNodeId']()).toBeNull();
    });

    it('clears movingNodeId when the overlay is dismissed', () => {
      component['movingNodeId'].set('file-1');
      component['onMoveOverlayHide']();
      expect(component['movingNodeId']()).toBeNull();
    });

    it('does nothing when no source is set', () => {
      const before = component.store.sessions();
      component['movingNodeId'].set(null);
      component['onMoveToRoot']();
      expect(component.store.sessions()).toBe(before);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenLabels(nodes: any[]): string[] {
  return nodes.flatMap((n) => [
    ...(n.label ? [n.label] : []),
    ...(n.children ? flattenLabels(n.children) : []),
  ]);
}
