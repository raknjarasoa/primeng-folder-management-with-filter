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
});
