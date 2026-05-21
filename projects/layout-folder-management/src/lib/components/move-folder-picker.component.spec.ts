import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { MoveFolderPickerComponent, MoveFolderRequest } from './move-folder-picker.component';
import { TreeItem, FlatRowData } from '../models/folder-tree.models';

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
    {
      id: 'f-empty',
      kind: 'folder',
      name: 'Sibling',
      children: [],
    },
    { id: 'file-top', kind: 'file' },
  ];
}

function makeRow(id: string, label: string, kind: 'file' | 'folder' = 'file'): FlatRowData {
  return { id, kind, label, depth: 0, expanded: false, hasChildren: false };
}

async function settle(fixture: ComponentFixture<MoveFolderPickerComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoveFolderPickerComponent', () => {
  let fixture: ComponentFixture<MoveFolderPickerComponent>;
  let component: MoveFolderPickerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoveFolderPickerComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MoveFolderPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', makeSessions());
  });

  it('moveCandidates is empty before open() is called', async () => {
    await settle(fixture);
    expect(component['moveCandidates']()).toEqual([]);
  });

  it('moveCandidates excludes the source row and its subtree', async () => {
    await settle(fixture);

    // Skip the popover by setting the source-row signals directly — same
    // post-condition as open() but without needing a real click event.
    component['movingRowId'].set('f-root');
    await settle(fixture);

    const ids = component['moveCandidates']().map((c) => c.id);
    expect(ids).not.toContain('f-root');
    expect(ids).not.toContain('f-nested');
    expect(ids).toContain('f-empty');
  });

  it('filteredMoveCandidates narrows the list by case-insensitive label match', async () => {
    await settle(fixture);
    component['movingRowId'].set('file-top');
    component['moveFilterText'].set('NEST');
    await settle(fixture);

    const ids = component['filteredMoveCandidates']().map((c) => c.id);
    expect(ids).toEqual(['f-nested']);
  });

  it('confirm emits moveTo with sourceId + targetFolderId', async () => {
    await settle(fixture);
    component['movingRowId'].set('file-top');

    let emitted: MoveFolderRequest | undefined;
    component.moveTo.subscribe((req) => (emitted = req));

    component['confirm']('f-nested');
    expect(emitted).toEqual({ sourceId: 'file-top', targetFolderId: 'f-nested' });
  });

  it('confirm(null) emits moveTo with targetFolderId = null (root)', async () => {
    await settle(fixture);
    component['movingRowId'].set('file-2');

    let emitted: MoveFolderRequest | undefined;
    component.moveTo.subscribe((req) => (emitted = req));

    component['confirm'](null);
    expect(emitted).toEqual({ sourceId: 'file-2', targetFolderId: null });
  });

  it('confirm without an open source does not emit', async () => {
    await settle(fixture);
    let emitted = 0;
    component.moveTo.subscribe(() => (emitted += 1));

    component['confirm']('f-nested');
    expect(emitted).toBe(0);
  });

  it('confirm clears the source state', async () => {
    await settle(fixture);
    component['movingRowId'].set('file-top');
    component['movingRowLabel'].set('Top Level File');
    component['movingRowKind'].set('file');
    component['moveFilterText'].set('xyz');

    component['confirm'](null);

    expect(component['movingRowId']()).toBeNull();
    expect(component['movingRowLabel']()).toBeNull();
    expect(component['movingRowKind']()).toBeNull();
    expect(component['moveFilterText']()).toBe('');
  });

  it('onHide resets the source state without emitting', async () => {
    await settle(fixture);
    component['movingRowId'].set('file-top');
    component['movingRowLabel'].set('Top Level File');

    let emitted = 0;
    component.moveTo.subscribe(() => (emitted += 1));

    component['onHide']();

    expect(component['movingRowId']()).toBeNull();
    expect(component['movingRowLabel']()).toBeNull();
    expect(emitted).toBe(0);
  });

  it('open() captures label + kind from the row and clears any prior filter', async () => {
    await settle(fixture);
    component['moveFilterText'].set('stale-filter');

    const row = makeRow('file-top', 'Top Level File', 'file');
    // Pass a stub event — Popover.toggle won't render in jsdom, but the
    // signal mutations are what we care about here.
    component.open(row, new Event('click'));

    expect(component['movingRowId']()).toBe('file-top');
    expect(component['movingRowLabel']()).toBe('Top Level File');
    expect(component['movingRowKind']()).toBe('file');
    expect(component['moveFilterText']()).toBe('');
  });
});
