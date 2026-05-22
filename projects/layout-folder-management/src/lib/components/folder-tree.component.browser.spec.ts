import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FolderTreeComponent } from './folder-tree.component';
import type { TreeItem } from '../models/folder-tree.models';
import type { LayoutInstance } from '../models/layout-instance.model';

// ---------------------------------------------------------------------------
// Static test data
// ---------------------------------------------------------------------------

const SESSIONS: TreeItem[] = [
  {
    id: 'f-root',
    kind: 'folder',
    name: 'Root Folder',
    children: [
      { id: 'file-1', kind: 'file' },
      {
        id: 'f-nested',
        kind: 'folder',
        name: 'Nested Folder',
        children: [{ id: 'file-2', kind: 'file' }],
      },
    ],
  },
  { id: 'file-top', kind: 'file' },
];

const LAYOUTS: LayoutInstance[] = [
  { id: 'file-1', name: 'Alpha Report', editable: true, username: '', description: '', tooltip: '' },
  { id: 'file-2', name: 'Beta Dashboard', editable: true, username: '', description: '', tooltip: '' },
  { id: 'file-top', name: 'Top Level File', editable: true, username: '', description: '', tooltip: '' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mountComponent(): Promise<ComponentFixture<FolderTreeComponent>> {
  await TestBed.configureTestingModule({
    imports: [FolderTreeComponent, NoopAnimationsModule],
  }).compileComponents();

  const fixture = TestBed.createComponent(FolderTreeComponent);
  fixture.componentRef.setInput('sessions', structuredClone(SESSIONS));
  fixture.componentRef.setInput('layouts', LAYOUTS);
  fixture.componentRef.setInput('selectedFileId', null);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

// Apply a filter via the internal signal and wait for the 300 ms debounce.
async function applyFilter(fixture: ComponentFixture<FolderTreeComponent>, text: string) {
  fixture.componentInstance['filterText'].set(text);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FolderTreeComponent — browser mode', () => {
  let fixture: ComponentFixture<FolderTreeComponent>;

  beforeEach(async () => {
    fixture = await mountComponent();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  // DOM structure
  // -------------------------------------------------------------------------

  it('renders the search input', async () => {
    await expect
      .element(page.getByPlaceholder('Search folders and files…'))
      .toBeInTheDocument();
  });

  it('renders the "New folder" button', async () => {
    await expect
      .element(page.getByRole('button', { name: /new folder/i }))
      .toBeInTheDocument();
  });

  it('renders root-level rows by label', async () => {
    await expect.element(page.getByText('Root Folder')).toBeInTheDocument();
    await expect.element(page.getByText('Top Level File')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Real user-input interaction
  // -------------------------------------------------------------------------

  it('reflects typed text in the search input', async () => {
    const input = page.getByPlaceholder('Search folders and files…');
    await userEvent.fill(input, 'alpha');

    await expect.element(input).toHaveValue('alpha');
  });

  // -------------------------------------------------------------------------
  // Filter / search
  // -------------------------------------------------------------------------

  it('shows no-results message when the filter matches nothing', async () => {
    await applyFilter(fixture, 'zzzzzzzzz');

    await expect.element(page.getByText(/No results for/)).toBeInTheDocument();
  });

  it('hides non-matching rows after a search', async () => {
    await applyFilter(fixture, 'alpha');

    await expect.element(page.getByText('Alpha Report')).toBeInTheDocument();
    await expect.element(page.getByText('Top Level File')).not.toBeInTheDocument();
  });

  it('restores all rows after clearing the search', async () => {
    await applyFilter(fixture, 'alpha');
    await applyFilter(fixture, '');

    await expect.element(page.getByText('Root Folder')).toBeInTheDocument();
    await expect.element(page.getByText('Top Level File')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // New-folder interaction
  // -------------------------------------------------------------------------

  it('"New folder" button is enabled by default', async () => {
    await expect
      .element(page.getByRole('button', { name: /new folder/i }))
      .not.toBeDisabled();
  });

  it('"New folder" button becomes disabled while a rename is in progress', async () => {
    fixture.componentInstance['onAddFolder']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await expect
      .element(page.getByRole('button', { name: /new folder/i }))
      .toBeDisabled();
  });

  it('handles consecutive drag and drop operations successfully', async () => {
    // We simulate consecutive drag-drop operations programmatically.
    // Pixel-perfect pointer drag simulation is highly flaky in headless environments
    // with custom scroll/coordinate offset hit testing.
    const tree = fixture.componentInstance;

    // First drag: move file-top into f-root
    const rootFolderRow = tree['flatRows']().find((r) => r.id === 'f-root')!;
    const topFileRow = tree['flatRows']().find((r) => r.id === 'file-top')!;

    // Trigger Drag Start
    tree['onDragStarted']({} as any, topFileRow);

    // Simulate move by setting drop target on Root Folder (rowIndex is its index, zone is 'into')
    const targetIndex = tree['flatRows']().indexOf(rootFolderRow);
    tree['dropTarget'].set({ rowIndex: targetIndex, zone: 'into' });

    // Trigger Drag End
    tree['onDragEnded']({} as any, topFileRow);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Verify file-top is now a child of f-root
    const sessions = tree.sessions();
    const updatedRoot = sessions.find((n) => n.id === 'f-root')!;
    expect(updatedRoot.children?.some((c) => c.id === 'file-top')).toBe(true);

    // Second drag: move file-1 (which is inside f-root) to top level after root folder
    // Since f-root was expanded upon dropping file-top, file-1 is in flatRows
    const file1Row = tree['flatRows']().find((r) => r.id === 'file-1')!;
    
    // Trigger Drag Start
    tree['onDragStarted']({} as any, file1Row);

    // Simulate drop target after f-root (which maps parent to null / root)
    tree['dropTarget'].set({ rowIndex: targetIndex, zone: 'after' });

    // Trigger Drag End
    tree['onDragEnded']({} as any, file1Row);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Verify file-1 is now at root level
    expect(tree.sessions().some((n) => n.id === 'file-1')).toBe(true);
  });
});
