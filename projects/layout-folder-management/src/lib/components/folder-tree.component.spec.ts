import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';

import { FolderTreeComponent } from './folder-tree.component';
import {
  TreeItem,
  isFolderNode,
  FlatRowData,
} from '../models/folder-tree.models';
import { LayoutInstance } from '../models/layout-instance.model';
import { MoveFolderPickerComponent } from './move-folder-picker.component';

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

async function settle(fixture: ComponentFixture<FolderTreeComponent>): Promise<void> {
  const viewportDebug = fixture.debugElement.query(By.css('.tree-viewport'));
  if (viewportDebug) {
    const el = viewportDebug.nativeElement;
    if (el && !el.hasOwnProperty('clientHeight')) {
      Object.defineProperty(el, 'clientHeight', { value: 1000, configurable: true });
    }
  }
  fixture.detectChanges();

  // Force CDK Virtual Scroll to re-evaluate its viewport size using the mocked clientHeight
  const comp = fixture.componentInstance as any;
  if (comp.viewport && comp.viewport()) {
    comp.viewport().checkViewportSize();
  }

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

    const rows = fixture.debugElement.queryAll(By.css('.tree-row'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('projects layout names onto file rows', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2'); // expand ancestors so file-2 surfaces
    await settle(fixture);

    const rootRow = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .label'));
    const topFileRow = fixture.debugElement.query(By.css('.tree-row[data-id="file-top"] .label'));
    const file2Row = fixture.debugElement.query(By.css('.tree-row[data-id="file-2"] .label'));

    expect(rootRow.nativeElement.textContent.trim()).toBe('Root Folder');
    expect(topFileRow.nativeElement.textContent.trim()).toBe('Top Level File');
    expect(file2Row.nativeElement.textContent.trim()).toBe('Beta Dashboard');
  });

  // -----------------------------------------------------------------------
  // Selection / auto-expansion
  // -----------------------------------------------------------------------

  it('auto-expands ancestors of the selected file', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    await settle(fixture);

    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement;
    const nestedChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-nested"] .chevron-btn')).nativeElement;

    expect(rootChevron.getAttribute('aria-label')).toBe('Collapse');
    expect(nestedChevron.getAttribute('aria-label')).toBe('Collapse');
    expect(fixture.debugElement.query(By.css('.tree-row[data-id="file-2"]'))).toBeTruthy();
  });

  it('leaves the tree collapsed when no file is selected', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement;
    expect(rootChevron.getAttribute('aria-label')).toBe('Expand');
    expect(fixture.debugElement.query(By.css('.tree-row[data-id="file-2"]'))).toBeNull();
  });

  it('emits fileSelected when a file row is clicked, even for re-clicks', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-1');
    await settle(fixture);

    const emitted: string[] = [];
    component.fileSelected.subscribe((id) => emitted.push(id));

    const fileContent = fixture.debugElement.query(By.css('.tree-row[data-id="file-1"] .file-content')).nativeElement;
    fileContent.click();
    fileContent.click();
    await settle(fixture);

    expect(emitted).toEqual(['file-1', 'file-1']);
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  it('filters rows by query and auto-expands ancestors of matches', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const filterInput = fixture.debugElement.query(By.css('.search-input')).nativeElement;
    filterInput.value = 'alpha';
    filterInput.dispatchEvent(new Event('input'));
    await settleAfterFilter(fixture);

    expect(fixture.debugElement.query(By.css('.tree-row[data-id="file-1"]'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.tree-row[data-id="file-top"]'))).toBeNull();

    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement;
    expect(rootChevron.getAttribute('aria-label')).toBe('Collapse');
  });

  it('returns empty list when filter matches nothing', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const filterInput = fixture.debugElement.query(By.css('.search-input')).nativeElement;
    filterInput.value = 'zzzzzzzzz';
    filterInput.dispatchEvent(new Event('input'));
    await settleAfterFilter(fixture);

    const rows = fixture.debugElement.queryAll(By.css('.tree-row'));
    expect(rows.length).toBe(0);

    const emptyState = fixture.debugElement.query(By.css('.empty-state'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain('No results for "zzzzzzzzz"');
  });

  it('disables drag while filtering', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const filterInput = fixture.debugElement.query(By.css('.search-input')).nativeElement;
    filterInput.value = 'alpha';
    filterInput.dispatchEvent(new Event('input'));
    await settleAfterFilter(fixture);

    const rootRow = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"]')).nativeElement as HTMLElement;
    expect(rootRow.getAttribute('draggable')).toBe('false');
  });

  // -----------------------------------------------------------------------
  // Rename flow
  // -----------------------------------------------------------------------

  it('enters rename mode via double click', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const label = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .folder-content .label')).nativeElement;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    expect(renameInput.value).toBe('Root Folder');
  });

  it('commits a rename and updates sessions', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const label = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .folder-content .label')).nativeElement;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.value = 'New Name';
    renameInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    const confirmBtn = fixture.debugElement.query(By.css('.action-btn--confirm')).nativeElement as HTMLButtonElement;
    confirmBtn.click();
    await settle(fixture);

    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeNull();
    const session = component.sessions()[0];
    expect(isFolderNode(session)).toBe(true);
    if (isFolderNode(session)) expect(session.name).toBe('New Name');
  });

  it('rejects rename with empty/whitespace name', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const label = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .folder-content .label')).nativeElement;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.value = '   ';
    renameInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    const confirmBtn = fixture.debugElement.query(By.css('.action-btn--confirm')).nativeElement as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // Try committing via Enter key
    renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(fixture);

    // Should still be in rename mode
    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeTruthy();
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('Root Folder');
  });

  it('commits a rename on blur if a valid name is present', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const label = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .folder-content .label')).nativeElement;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.value = 'New Name via Blur';
    renameInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    renameInput.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeNull();
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('New Name via Blur');
  });

  it('reverts/cancels the rename on blur if the name is empty for an existing folder', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const label = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .folder-content .label')).nativeElement;
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.value = '   ';
    renameInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    renameInput.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeNull();
    const session = component.sessions()[0];
    if (isFolderNode(session)) expect(session.name).toBe('Root Folder'); // reverted/unchanged
  });

  it('cancels and deletes the folder on blur if the name is empty for a newly created folder', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const beforeCount = component.sessions().length;
    const newFolderBtn = fixture.debugElement.query(By.css('.new-folder-btn')).nativeElement as HTMLButtonElement;
    newFolderBtn.click();
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.value = '   '; // empty name
    renameInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    renameInput.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeNull();
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
    const newFolderBtn = fixture.debugElement.query(By.css('.new-folder-btn')).nativeElement as HTMLButtonElement;
    newFolderBtn.click();
    await settle(fixture);

    expect(component.sessions().length).toBe(before + 1);
    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeTruthy();
  });

  it('removes the ephemeral folder when rename is cancelled', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const before = component.sessions().length;
    const newFolderBtn = fixture.debugElement.query(By.css('.new-folder-btn')).nativeElement as HTMLButtonElement;
    newFolderBtn.click();
    await settle(fixture);

    const renameInput = fixture.debugElement.query(By.css('.rename-input')).nativeElement as HTMLInputElement;
    renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);

    expect(component.sessions().length).toBe(before);
    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeNull();
  });

  it('adds a subfolder inside a parent and expands that parent', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const first = component.sessions()[0];
    if (!isFolderNode(first)) throw new Error('expected folder');
    const childrenBefore = first.children.length;

    const addSubfolderBtn = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .action-btn[title="Add subfolder"]')).nativeElement as HTMLButtonElement;
    addSubfolderBtn.click();
    await settle(fixture);

    const updated = component.sessions()[0];
    if (isFolderNode(updated)) {
      expect(updated.children.length).toBe(childrenBefore + 1);
    }
    expect(fixture.debugElement.query(By.css('.rename-input'))).toBeTruthy();
    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement;
    expect(rootChevron.getAttribute('aria-label')).toBe('Collapse'); // auto-expanded
  });

  // -----------------------------------------------------------------------
  // Toggle expand
  // -----------------------------------------------------------------------

  it('toggleExpand flips the expanded set', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement as HTMLButtonElement;
    expect(rootChevron.getAttribute('aria-label')).toBe('Expand');

    rootChevron.click();
    await settle(fixture);
    expect(rootChevron.getAttribute('aria-label')).toBe('Collapse');

    rootChevron.click();
    await settle(fixture);
    expect(rootChevron.getAttribute('aria-label')).toBe('Expand');
  });

  // -----------------------------------------------------------------------
  // Delete (no confirmation dialog any more — immediate)
  // -----------------------------------------------------------------------

  it('removes a folder immediately on delete', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-2');
    await settle(fixture);

    fixture.componentRef.setInput('sessions', [
      ...makeSessions(),
      { id: 'f-empty', kind: 'folder', name: 'Empty', children: [] },
    ]);
    await settle(fixture);

    const before = component.sessions().length;
    const deleteBtn = fixture.debugElement.query(By.css('.tree-row[data-id="f-empty"] .action-btn--danger[title="Delete"]')).nativeElement as HTMLButtonElement;
    deleteBtn.click();
    await settle(fixture);

    expect(component.sessions().length).toBe(before - 1);
  });

  it('clears selectedFileId when the selected file is deleted', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    fixture.componentRef.setInput('selectedFileId', 'file-top');
    await settle(fixture);

    // Call the component protected onDelete directly since files do not render a UI delete trash button
    (component as any).onDelete({
      id: 'file-top',
      kind: 'file',
      label: 'Top Level File',
      depth: 0,
      expanded: false,
      hasChildren: false,
    });
    await settle(fixture);

    expect(component.selectedFileId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Move-to picker integration
  // -----------------------------------------------------------------------

  it('onMoveConfirmed moves the source into the chosen folder and expands it', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    // Expand f-root so its nested child f-nested renders in the DOM
    const rootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-root"] .chevron-btn')).nativeElement as HTMLButtonElement;
    rootChevron.click();
    await settle(fixture);

    // Fetch subcomponent picker directly to simulate confirming selection
    const picker = fixture.debugElement.query(By.directive(MoveFolderPickerComponent)).componentInstance as MoveFolderPickerComponent;
    picker.moveTo.emit({ sourceId: 'file-top', targetFolderId: 'f-nested' });
    await settle(fixture);

    const root = component.sessions()[0];
    expect(isFolderNode(root)).toBe(true);
    if (!isFolderNode(root)) return;
    const nested = root.children.find((c) => c.id === 'f-nested');
    expect(nested).toBeDefined();
    if (nested && isFolderNode(nested)) {
      expect(nested.children.map((c) => c.id)).toContain('file-top');
    }
    
    // Verify destination f-nested is expanded in the DOM
    const nestedChevron = fixture.debugElement.query(By.css('.tree-row[data-id="f-nested"] .chevron-btn')).nativeElement;
    expect(nestedChevron.getAttribute('aria-label')).toBe('Collapse');
  });

  it('onMoveConfirmed with null target moves the source to root', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const picker = fixture.debugElement.query(By.directive(MoveFolderPickerComponent)).componentInstance as MoveFolderPickerComponent;
    picker.moveTo.emit({ sourceId: 'file-2', targetFolderId: null });
    await settle(fixture);

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
    await settle(fixture);

    // Expand the virtual "Other Users" folder by clicking its chevron
    const othersRootChevron = fixture.debugElement.query(By.css('.tree-row[data-id="virtual-others-root"] .chevron-btn')).nativeElement as HTMLButtonElement;
    othersRootChevron.click();
    await settle(fixture);

    // Expand the virtual user folder by clicking its chevron
    const userChevron = fixture.debugElement.query(By.css('.tree-row[data-id="virtual-user-John Doe"] .chevron-btn')).nativeElement as HTMLButtonElement;
    userChevron.click();
    await settle(fixture);

    // Assert rows are successfully rendered in the DOM
    const rootRow = fixture.debugElement.query(By.css('.tree-row[data-id="virtual-others-root"]'));
    const userRow = fixture.debugElement.query(By.css('.tree-row[data-id="virtual-user-John Doe"]'));
    const orphanRow = fixture.debugElement.query(By.css('.tree-row[data-id="layout-orphan"]'));

    expect(rootRow).toBeTruthy();
    expect(userRow).toBeTruthy();
    expect(orphanRow).toBeTruthy();

    expect(rootRow.nativeElement.classList.contains('tree-row--other')).toBe(true);
    expect(userRow.nativeElement.classList.contains('tree-row--other')).toBe(true);
    expect(orphanRow.nativeElement.classList.contains('tree-row--other')).toBe(true);
  });

  it('updates the autoscroller but clears the drop target and blocks dropping when dragging over forbidden / other-user rows', async () => {
    fixture.componentRef.setInput('sessions', makeSessions());
    fixture.componentRef.setInput('layouts', makeLayouts());
    await settle(fixture);

    const tree = component as any;

    // Simulate drag start on file-top
    const topFileRow = tree.store.flatRows().find((r: FlatRowData) => r.id === 'file-top')!;
    tree.onDragStart({} as any, topFileRow);

    // Mock viewport rect on the autoscroller so that bounds check passes
    vi.spyOn(tree.autoscroller, 'getViewportRect').mockReturnValue({
      top: 100,
      height: 400,
      bottom: 500,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as any);

    // Spy on the move method of the autoscroller
    const autoscrollerMoveSpy = vi.spyOn(tree.autoscroller, 'move');

    // Create a mock drag event targeting an "Other Users" row
    const mockOtherRow: FlatRowData = {
      id: 'virtual-others-root',
      parentId: null,
      kind: 'folder',
      name: 'Other Users',
      level: 0,
      expandable: true,
      isOther: true,
      editable: false,
      username: '',
      description: '',
      tooltip: '',
    };

    const dragEvent = {
      clientY: 200, // 200 - 100 = 100 pointerY inside viewport bounds
      preventDefault: vi.fn(),
    } as any;

    // Set a dummy dropTarget beforehand to verify it gets cleared
    tree.store.setDropTarget({ rowIndex: 0, zone: 'into' });
    expect(tree.store.dropTarget()).not.toBeNull();

    // Trigger onDragOver
    tree.onDragOver(dragEvent, mockOtherRow, 0);

    // Assert: Drop target is cleared
    expect(tree.store.dropTarget()).toBeNull();

    // Assert: preventDefault is NOT called (dropping is blocked)
    expect(dragEvent.preventDefault).not.toHaveBeenCalled();

    // Assert: autoscroller.move WAS called with pointer Y (100)
    expect(autoscrollerMoveSpy).toHaveBeenCalledWith(100);
  });
});
