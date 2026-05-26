import { Injectable } from '@angular/core';
import { LayoutInstance, TreeItem } from 'layout-folder-management';
import { delay, Observable, of } from 'rxjs';

// Perf-test seed: 100,000 generated items arranged into 400 folders × 250 files,
// nested under a single "Performance test" parent.
const PERF_FOLDER_COUNT = 400;
const PERF_FILES_PER_FOLDER = 250;

function buildPerfSessions(): TreeItem {
  const folders: TreeItem[] = [];
  for (let f = 0; f < PERF_FOLDER_COUNT; f++) {
    const children: TreeItem[] = [];
    for (let i = 0; i < PERF_FILES_PER_FOLDER; i++) {
      children.push({ id: `perf-${f}-${i}`, kind: 'file' });
    }
    folders.push({
      id: `f-perf-${f}`,
      kind: 'folder',
      name: `Batch ${f + 1}`,
      children,
    });
  }
  return { id: 'f-perf', kind: 'folder', name: 'Performance test (250)', children: folders };
}

function buildPerfLayouts(): LayoutInstance[] {
  const layouts: LayoutInstance[] = [];
  for (let f = 0; f < PERF_FOLDER_COUNT; f++) {
    for (let i = 0; i < PERF_FILES_PER_FOLDER; i++) {
      const idx = f * PERF_FILES_PER_FOLDER + i;
      layouts.push({
        id: `perf-${f}-${i}`,
        name: `Perf layout #${idx + 1}`,
        editable: false,
        username: '',
        description: '',
        tooltip: '',
      });
    }
  }
  return layouts;
}

@Injectable({ providedIn: 'root' })
export class FolderApiService {
  // --- Instance 1 Data (e.g. User 1) ---
  fetchSessions1(): Observable<TreeItem[]> {
    const tree: TreeItem[] = [
      {
        id: 'f-trading',
        kind: 'folder',
        name: 'Trading desks',
        children: [
          { id: 'v-001', kind: 'file' },
          { id: 'v-002', kind: 'file' },
          {
            id: 'f-equity',
            kind: 'folder',
            name: 'Equity',
            children: [
              { id: 'v-003', kind: 'file' },
              { id: 'v-004', kind: 'file' },
            ],
          },
        ],
      },
      {
        id: 'f-risk',
        kind: 'folder',
        name: 'Risk',
        children: [
          { id: 'v-005', kind: 'file' },
          { id: 'v-006', kind: 'file' },
        ],
      },
      { id: 'v-007', kind: 'file' },
      buildPerfSessions(),
    ];
    return of(tree).pipe(delay(150));
  }

  fetchLayouts1(): Observable<LayoutInstance[]> {
    const layouts: LayoutInstance[] = [
      { id: 'v-001', name: 'EUR/USD intraday', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-002', name: 'FX volatility surface', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-003', name: 'CAC 40 momentum', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-004', name: 'S&P sector heatmap', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-005', name: 'VaR by book', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-006', name: 'Stress scenarios Q2', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-007', name: 'Daily P&L summary', editable: true, username: '', description: '', tooltip: '' },

      // Data not present in sessions1 (Will be grouped under "Others")
      { id: 'v-other1', name: 'John Doe Report', editable: false, username: 'John', description: 'Daily report', tooltip: '' },
      { id: 'v-other2', name: 'John Doe Summary', editable: false, username: 'John', description: 'Summary data', tooltip: '' },
      { id: 'v-other3', name: 'Alice Draft', editable: false, username: 'Alice', description: 'Working draft', tooltip: '' },
      { id: 'v-other4', name: 'Unknown Data', editable: false, username: '', description: '', tooltip: '' },

      ...buildPerfLayouts(),
    ];
    return of(layouts).pipe(delay(120));
  }

  // --- Instance 2 Data (e.g. User 2) ---
  fetchSessions2(): Observable<TreeItem[]> {
    const tree: TreeItem[] = [
      {
        id: 'f-crypto',
        kind: 'folder',
        name: 'Crypto Assets',
        children: [
          { id: 'v-101', kind: 'file' },
          { id: 'v-102', kind: 'file' },
        ],
      },
      {
        id: 'f-defi',
        kind: 'folder',
        name: 'DeFi Protocols',
        children: [
          { id: 'v-103', kind: 'file' },
        ],
      },
    ];
    return of(tree).pipe(delay(250));
  }

  fetchLayouts2(): Observable<LayoutInstance[]> {
    const layouts: LayoutInstance[] = [
      { id: 'v-101', name: 'BTC/USDT Volume', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-102', name: 'ETH Gas Tracker', editable: true, username: '', description: '', tooltip: '' },
      { id: 'v-103', name: 'Uniswap Liquidity', editable: true, username: '', description: '', tooltip: '' },
    ];
    return of(layouts).pipe(delay(200));
  }
}
