import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FolderTreeComponent } from './folder-tree.component';
import {
  TreeItem,
  isFolderNode,
  FlatRowData,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

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

function findRow(rows: readonly FlatRowData[], id: string): FlatRowData | undefined {
  return rows.find((r) => r.id === id);
}

async function settle(fixture: ComponentFixture<FolderTreeComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

// flatRows depends on the *debounced* filter signal (300 ms). Tests that
// mutate filterText need to wait past that or the new rows won't be visible.
async function settleAfterFilter(fixture: ComponentFixture<FolderTreeComponent>): Promise<void> {
  await new Promise((r) => setTimeout(r, 350));
  await settle(fixture);
}

// ---------------------------------------------------------------------------
// Tests
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
  // Creation
  // -----------------------------------------------------------------------

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('produces a non-empty flatRows list when inputs are set', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    expect(component['flatRows']().length).toBeGreaterThan(0);
  });

  it('projects layout names onto file rows', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2'); // expand ancestors so file-2 surfaces
    await settle(fixture);

    const rows = component['flatRows']();
    expect(findRow(rows, 'f-root')?.label).toBe('Root Folder');
    expect(findRow(rows, 'file-top')?.label).toBe('Top Level File');
    expect(findRow(rows, 'file-2')?.label).toBe('Beta Dashboard');
  });

  // -----------------------------------------------------------------------
  // Selection / auto-expansion
  // -----------------------------------------------------------------------

  it('auto-expands ancestors of the selected file', async () => {
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

  it('emits fileSelected when a file row is clicked, even for re-clicks', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-1');
    await settle(fixture);

    const emitted: string[] = [];
    component.fileSelected.subscribe((id) => emitted.push(id));

    const row = findRow(component['flatRows'](), 'file-1')!;
    component['onRowClick'](row);
    component['onRowClick'](row); // same id again — model wouldn't notify, but output should

    expect(emitted).toEqual(['file-1', 'file-1']);
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  it('filters rows by query and auto-expands ancestors of matches', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['filterText'].set('alpha');
    await settleAfterFilter(fixture);

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
    await settleAfterFilter(fixture);

    expect(component['flatRows']().length).toBe(0);
    expect(component['isFiltering']()).toBe(true);
  });

  it('disables drag while filtering', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['filterText'].set('alpha');
    await settleAfterFilter(fixture);

    const root = findRow(component['flatRows'](), 'f-root')!;
    expect(component['canDrag'](root)).toBe(false);
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

  it('commits a rename and updates sessions', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('New Name');
    component['commitRename']('f-root');

    expect(component['editingId']()).toBeNull();
    const session = component.sessions()[0];
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

    expect(component['editingId']()).toBe('f-root'); // still editing
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('Root Folder');
  });

  it('commits a rename on blur if a valid name is present', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('New Name via Blur');
    component['onRenameInputBlur']('f-root');

    expect(component['editingId']()).toBeNull();
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('New Name via Blur');
  });

  it('reverts/cancels the rename on blur if the name is empty for an existing folder', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['startRename']('f-root', 'Root Folder');
    component['editingValue'].set('   ');
    component['onRenameInputBlur']('f-root');

    expect(component['editingId']()).toBeNull();
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('Root Folder'); // reverted/unchanged
  });

  it('cancels and deletes the folder on blur if the name is empty for a newly created folder', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const beforeCount = component.sessions().length;
    component['onAddFolder'](); // adds a folder and triggers rename mode

    const targetId = component['editingId']()!;
    component['editingValue'].set('   '); // empty name
    component['onRenameInputBlur'](targetId);

    expect(component['editingId']()).toBeNull();
    expect(component['creatingId']()).toBeNull();
    expect(component.sessions().length).toBe(beforeCount); // deleted
  });

  // -----------------------------------------------------------------------
  // Add folder flow
  // -----------------------------------------------------------------------

  it('adds a folder at root and enters rename mode', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const before = component.sessions().length;
    component['onAddFolder']();

    expect(component.sessions().length).toBe(before + 1);
    expect(component['editingId']()).not.toBeNull();
    expect(component['creatingId']()).not.toBeNull();
  });

  it('removes the ephemeral folder when rename is cancelled', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const before = component.sessions().length;
    component['onAddFolder']();
    component['cancelRename']();

    expect(component.sessions().length).toBe(before);
    expect(component['editingId']()).toBeNull();
    expect(component['creatingId']()).toBeNull();
  });

  it('adds a subfolder inside a parent and expands that parent', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const first = component.sessions()[0];
    if (!isFolderNode(first)) throw new Error('expected folder');
    const childrenBefore = first.children.length;

    component['onAddFolder']('f-root');

    const updated = component.sessions()[0];
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
  // Delete (no confirmation dialog any more — immediate)
  // -----------------------------------------------------------------------

  it('removes a folder immediately on delete', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    await settle(fixture);

    // Pick an empty folder to delete (deletion is only enabled for empty
    // folders in the UI, but the protected method itself does not enforce it).
    fixture.componentRef.setInput('sessions', [
      ...makeSessions(),
      { id: 'f-empty', kind: 'folder', name: 'Empty', children: [] },
    ]);
    await settle(fixture);

    const before = component.sessions().length;
    component['onDelete']({
      id: 'f-empty',
      kind: 'folder',
      label: 'Empty',
      depth: 0,
      expanded: false,
      hasChildren: false,
    });

    expect(component.sessions().length).toBe(before - 1);
  });

  it('clears selectedFileId when the selected file is deleted', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-top');
    await settle(fixture);

    component['onDelete']({
      id: 'file-top',
      kind: 'file',
      label: 'Top Level File',
      depth: 0,
      expanded: false,
      hasChildren: false,
    });

    expect(component.selectedFileId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Move-to picker integration
  //
  // The picker UI now lives in MoveFolderPickerComponent (covered by its own
  // spec). What the parent owns is the post-emit handler — applying the move
  // and auto-expanding the destination folder.
  // -----------------------------------------------------------------------

  it('onMoveConfirmed moves the source into the chosen folder and expands it', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['onMoveConfirmed']({ sourceId: 'file-top', targetFolderId: 'f-nested' });

    const root = component.sessions()[0];
    expect(isFolderNode(root)).toBe(true);
    if (!isFolderNode(root)) return;
    const nested = root.children.find((c) => c.id === 'f-nested');
    expect(nested).toBeDefined();
    if (nested && isFolderNode(nested)) {
      expect(nested.children.map((c) => c.id)).toContain('file-top');
    }
    expect(component['expandedIds']().has('f-nested')).toBe(true);
  });

  it('onMoveConfirmed with null target moves the source to root', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    component['onMoveConfirmed']({ sourceId: 'file-2', targetFolderId: null });

    expect(component.sessions().some((n) => n.id === 'file-2')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Orphans / Other Users
  // -----------------------------------------------------------------------

  it('groups orphan layouts under "Other Users" and renders user folders', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    const orphanLayout: LayoutInstance = {
      id: 'layout-orphan',
      name: 'Orphan Layout',
      editable: false,
      username: 'John Doe',
      description: '',
      tooltip: '',
    };
    fixture.componentRef.setInput('layouts', [...makeLayouts(), orphanLayout]);

    // Expand the virtual "Other Users" folder and the user folder
    component['expandedIds'].update((set) => {
      const next = new Set(set);
      next.add('others-root');
      next.add('others-John Doe');
      return next;
    });
    await settle(fixture);

    const rows = component['flatRows']();
    const rootRow = findRow(rows, 'others-root');
    const userRow = findRow(rows, 'others-John Doe');
    const orphanRow = findRow(rows, 'layout-orphan');

    expect(rootRow).toBeDefined();
    expect(userRow).toBeDefined();
    expect(orphanRow).toBeDefined();

    expect(rootRow?.isOther).toBe(true);
    expect(userRow?.isOther).toBe(true);
    expect(orphanRow?.isOther).toBe(true);

    // Verify row properties
    expect(rootRow?.kind).toBe('folder');
    expect(userRow?.kind).toBe('folder');
    expect(orphanRow?.kind).toBe('file');
  });
});
