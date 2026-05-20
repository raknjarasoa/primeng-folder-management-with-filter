import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FolderTreeComponent } from './folder-tree.component';
import {
  SessionNode,
  LayoutInstance,
  isFolderNode,
  FlatRow,
} from '../models/folder-tree.models';

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

function makeLayouts(): LayoutInstance[] {
  return [
    { id: 'file-1', name: 'Alpha Report', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'file-2', name: 'Beta Dashboard', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
    { id: 'file-top', name: 'Top Level File', lastUpdated: '2026-01-01T00:00:00Z', lastViewDate: '2026-01-02T00:00:00Z' },
  ];
}

function findRow(rows: readonly FlatRow[], id: string): FlatRow | undefined {
  return rows.find((r) => r.id === id);
}

async function settle(fixture: ComponentFixture<FolderTreeComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
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

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('produces a non-empty flat row list when inputs are set', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    expect(component['flatRows']().length).toBeGreaterThan(0);
  });

  it('projects layout names onto file rows', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2'); // expand ancestors
    await settle(fixture);

    const rows = component['flatRows']();
    expect(findRow(rows, 'f-root')?.label).toBe('Root Folder');
    expect(findRow(rows, 'file-top')?.label).toBe('Top Level File');
  });

  // -----------------------------------------------------------------------
  // File selection / auto-expansion
  // -----------------------------------------------------------------------

  it('auto-expands ancestor folders for a selected file', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    await settle(fixture);

    expect(component['expandedIds']().has('f-root')).toBe(true);
    expect(component['expandedIds']().has('f-nested')).toBe(true);
    expect(findRow(component['flatRows'](), 'file-2')).toBeDefined();
  });

  it('leaves the tree collapsed when no file is selected', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    expect(component['expandedIds']().size).toBe(0);
    expect(findRow(component['flatRows'](), 'file-2')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  it('filters rows by query and auto-expands ancestors of matches', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['filterText'].set('alpha');
    await new Promise((r) => setTimeout(r, 350));
    await settle(fixture);

    const rows = component['flatRows']();
    expect(findRow(rows, 'file-1')).toBeDefined();
    expect(findRow(rows, 'file-top')).toBeUndefined();
    expect(findRow(rows, 'f-root')?.expanded).toBe(true);
  });

  it('returns empty list when filter matches nothing', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['filterText'].set('zzzzzzzzz');
    await new Promise((r) => setTimeout(r, 350));
    await settle(fixture);

    expect(component['flatRows']().length).toBe(0);
    expect(component['isFiltering']()).toBe(true);
  });

  it('disables drag while filtering', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['filterText'].set('alpha');
    await new Promise((r) => setTimeout(r, 350));
    await settle(fixture);

    const aRow = findRow(component['flatRows'](), 'f-root')!;
    expect(component['canDrag'](aRow)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Rename flow
  // -----------------------------------------------------------------------

  it('enters rename mode via startRename', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');

    expect(component['editingId']()).toBe('f-root');
    expect(component['editingValue']()).toBe('Root Folder');
  });

  it('commits rename and updates the store', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('New Name');
    component['commitRename']('f-root');

    expect(component['editingId']()).toBeNull();
    const session = component.store.sessions()[0];
    expect(isFolderNode(session)).toBe(true);
    if (isFolderNode(session)) expect(session.name).toBe('New Name');
  });

  it('rejects rename with empty/whitespace name', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('   ');
    component['commitRename']('f-root');

    expect(component['editingId']()).toBe('f-root');
    const session = component.store.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('Root Folder');
  });

  // -----------------------------------------------------------------------
  // Add folder flow
  // -----------------------------------------------------------------------

  it('adds a folder at root and enters rename mode', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const before = component.store.sessions().length;
    component['onAddFolder']();

    expect(component.store.sessions().length).toBe(before + 1);
    expect(component['editingId']()).not.toBeNull();
    expect(component['creatingId']()).not.toBeNull();
  });

  it('removes ephemeral folder on cancel', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const before = component.store.sessions().length;
    component['onAddFolder']();
    const newId = component['creatingId']()!;
    component['cancelRename'](newId);

    expect(component.store.sessions().length).toBe(before);
    expect(component['editingId']()).toBeNull();
    expect(component['creatingId']()).toBeNull();
  });

  it('adds a subfolder inside a parent and expands it', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const first = component.store.sessions()[0];
    if (!isFolderNode(first)) throw new Error('expected folder');
    const childrenBefore = first.children.length;

    component['onAddFolder']('f-root');

    const updated = component.store.sessions()[0];
    if (isFolderNode(updated)) {
      expect(updated.children.length).toBe(childrenBefore + 1);
    }
    expect(component['editingId']()).not.toBeNull();
    expect(component['expandedIds']().has('f-root')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Toggle expand
  // -----------------------------------------------------------------------

  it('toggleExpand flips the expanded set', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    expect(component['expandedIds']().has('f-root')).toBe(false);
    component['toggleExpand']('f-root');
    expect(component['expandedIds']().has('f-root')).toBe(true);
    component['toggleExpand']('f-root');
    expect(component['expandedIds']().has('f-root')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Delete flow
  // -----------------------------------------------------------------------

  it('opens the confirmation dialog on delete', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const confirmSpy = vi.spyOn(component['confirmationService'], 'confirm');
    const fileRow: FlatRow = {
      id: 'file-top',
      kind: 'file',
      label: 'Top Level File',
      depth: 0,
      expanded: false,
      hasChildren: false,
    };
    component['onDelete'](fileRow);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(confirmSpy.mock.calls[0][0].header).toBe('Confirm Deletion');
  });
});
