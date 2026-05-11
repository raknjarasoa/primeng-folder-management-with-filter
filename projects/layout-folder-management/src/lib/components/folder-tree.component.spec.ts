import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

import { FolderTreeComponent } from './folder-tree.component';
import { SessionNode, Layout } from '../models/folder-tree.models';

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

    const treeNodes = component.treeValue();
    expect(treeNodes.length).toBeGreaterThan(0);
  });

  it('should project correct labels from layouts', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const nodes = component.treeValue();
    // Root folder label comes from session name
    expect(nodes[0].label).toBe('Root Folder');
    // Top level file label comes from layout name
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

    const selectedNode = component.selectedNode();
    expect(selectedNode).not.toBeNull();
    expect(selectedNode!.key).toBe('file-1');
  });

  it('should auto-expand ancestor folders for a selected file', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const treeNodes = component.treeValue();
    // Root folder should be expanded since file-2 is nested inside f-root > f-nested
    expect(treeNodes[0].expanded).toBe(true);
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
    await new Promise(r => setTimeout(r, 350));

    const nodes = component.treeValue();
    // Should show only matching nodes: Root Folder (ancestor) containing Alpha Report
    const allLabels = flattenLabels(nodes);
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
    await new Promise(r => setTimeout(r, 350));

    const nodes = component.treeValue();
    // All ancestor folders should be expanded during filter
    for (const n of nodes) {
      if (n.children?.length) {
        expect(n.expanded).toBe(true);
      }
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
    await new Promise(r => setTimeout(r, 350));

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
    await new Promise(r => setTimeout(r, 350));

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

  it('should clear "(untitled folder)" placeholder on startRename', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['startRename']('f-root', '(untitled folder)');

    expect(component['editingValue']()).toBe('');
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
    expect(component.store.sessions()[0].name).toBe('New Name');
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

    // Still in editing mode
    expect(component['editingId']()).toBe('f-root');
    // Store unchanged
    expect(component.store.sessions()[0].name).toBe('Root Folder');
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

    const childrenBefore = component.store.sessions()[0].children!.length;
    component['onAddFolder']('f-root');

    expect(component.store.sessions()[0].children!.length).toBe(childrenBefore + 1);
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
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenLabels(nodes: any[]): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    if (n.label) result.push(n.label);
    if (n.children) result.push(...flattenLabels(n.children));
  }
  return result;
}
