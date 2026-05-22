import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { Popover } from 'primeng/popover';

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

function makeManySessions(): TreeItem[] {
  return [
    { id: 'f-1', kind: 'folder', name: 'Folder One', children: [] },
    { id: 'f-2', kind: 'folder', name: 'Folder Two', children: [] },
    { id: 'f-3', kind: 'folder', name: 'Folder Three', children: [] },
    { id: 'f-4', kind: 'folder', name: 'Folder Four', children: [] },
    { id: 'f-5', kind: 'folder', name: 'Folder Five', children: [] },
    { id: 'f-6', kind: 'folder', name: 'Folder Six', children: [] },
    { id: 'f-nested', kind: 'folder', name: 'Nested Folder', children: [] },
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
  let targetEl: HTMLButtonElement;
  let dummyEvent: Event;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoveFolderPickerComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MoveFolderPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', makeSessions());

    // Create a real attached target element to avoid PrimeNG coordinate measurement crashes
    targetEl = document.createElement('button');
    document.body.appendChild(targetEl);
    dummyEvent = {
      type: 'click',
      target: targetEl,
      currentTarget: targetEl,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as Event;
  });

  afterEach(() => {
    if (targetEl && targetEl.parentNode) {
      targetEl.parentNode.removeChild(targetEl);
    }
  });

  it('moveCandidates is empty and popover is hidden before open() is called', async () => {
    await settle(fixture);
    const movePicker = document.querySelector('.move-picker');
    expect(movePicker).toBeNull();
  });

  it('moveCandidates excludes the source row and its subtree', async () => {
    await settle(fixture);

    const sourceRow = makeRow('f-root', 'Root Folder', 'folder');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    const options = Array.from(document.querySelectorAll('.move-picker__option')) as HTMLButtonElement[];
    const labels = options.map((opt) => opt.textContent?.trim() || '');

    expect(labels.some(l => l.includes('Sibling'))).toBe(true);
    expect(labels.some(l => l.includes('Root Folder'))).toBe(false);
    expect(labels.some(l => l.includes('Nested'))).toBe(false);
  });

  it('filteredMoveCandidates narrows the list by case-insensitive label match', async () => {
    fixture.componentRef.setInput('sessions', makeManySessions());
    await settle(fixture);

    const sourceRow = makeRow('f-1', 'Folder One', 'folder');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    const filterInput = document.querySelector('.move-picker__filter-input') as HTMLInputElement;
    expect(filterInput).toBeTruthy();

    filterInput.value = 'NEST';
    filterInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    const options = Array.from(document.querySelectorAll('.move-picker__option')) as HTMLButtonElement[];
    const labels = options.map((opt) => opt.textContent?.trim() || '');

    const folderOptions = labels.filter(l => !l.includes('Root'));
    expect(folderOptions.length).toBe(1);
    expect(folderOptions[0]).toContain('Nested Folder');
  });

  it('confirm emits moveTo with sourceId + targetFolderId when option clicked', async () => {
    await settle(fixture);

    const sourceRow = makeRow('file-top', 'Top Level File', 'file');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    let emitted: MoveFolderRequest | undefined;
    component.moveTo.subscribe((req) => (emitted = req));

    const options = Array.from(document.querySelectorAll('.move-picker__option')) as HTMLButtonElement[];
    const nestedBtn = options.find((opt) => opt.textContent?.includes('Nested'));
    expect(nestedBtn).toBeDefined();
    nestedBtn?.click();
    await settle(fixture);

    expect(emitted).toEqual({ sourceId: 'file-top', targetFolderId: 'f-nested' });
  });

  it('confirm(null) emits moveTo with targetFolderId = null (root) when Root clicked', async () => {
    await settle(fixture);

    const sourceRow = makeRow('file-2', 'Beta Dashboard', 'file');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    let emitted: MoveFolderRequest | undefined;
    component.moveTo.subscribe((req) => (emitted = req));

    const rootBtn = document.querySelector('.move-picker__option--root') as HTMLButtonElement;
    expect(rootBtn).toBeTruthy();
    rootBtn.click();
    await settle(fixture);

    expect(emitted).toEqual({ sourceId: 'file-2', targetFolderId: null });
  });

  it('closes popover and hides DOM elements when confirm occurs', async () => {
    await settle(fixture);

    const sourceRow = makeRow('file-top', 'Top Level File', 'file');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    expect(document.querySelector('.move-picker')).toBeTruthy();

    const rootBtn = document.querySelector('.move-picker__option--root') as HTMLButtonElement;
    rootBtn.click();
    await settle(fixture);

    // Popover is dismissed, source is cleared
    expect(document.querySelector('.move-picker__source')).toBeNull();
  });

  it('onHide resets the source state and popover hides without emitting', async () => {
    await settle(fixture);

    const sourceRow = makeRow('file-top', 'Top Level File', 'file');
    component.open(sourceRow, dummyEvent);
    await settle(fixture);

    let emitted = 0;
    component.moveTo.subscribe(() => (emitted += 1));

    const popoverDE = fixture.debugElement.query(By.directive(Popover));
    const popover = popoverDE.componentInstance as Popover;
    popover.onHide.emit();
    await settle(fixture);

    expect(emitted).toBe(0);
    // Source details are cleared
    expect(document.querySelector('.move-picker__source')).toBeNull();
  });

  it('open() captures label + kind from the row and clears any prior filter', async () => {
    fixture.componentRef.setInput('sessions', makeManySessions());
    await settle(fixture);

    const row1 = makeRow('f-1', 'Folder One', 'folder');
    component.open(row1, dummyEvent);
    await settle(fixture);

    const filterInput = document.querySelector('.move-picker__filter-input') as HTMLInputElement;
    filterInput.value = 'stale-filter';
    filterInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    // Close popover to reset show-toggle state
    const popoverDE = fixture.debugElement.query(By.directive(Popover));
    const popover = popoverDE.componentInstance as Popover;
    popover.hide();
    await settle(fixture);

    const row2 = makeRow('file-top', 'Top Level File', 'file');
    component.open(row2, dummyEvent);
    await settle(fixture);

    const sourceLabel = document.querySelector('.move-picker__source-label')?.textContent?.trim();
    expect(sourceLabel).toBe('Top Level File');

    const sourceIcon = document.querySelector('.move-picker__source i');
    expect(sourceIcon?.classList.contains('fa-file')).toBe(true);

    const newFilterInput = document.querySelector('.move-picker__filter-input') as HTMLInputElement;
    expect(newFilterInput.value).toBe('');
  });
});
