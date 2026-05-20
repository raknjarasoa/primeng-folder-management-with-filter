import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { SessionNode, LayoutInstance } from 'layout-folder-management';

@Injectable({ providedIn: 'root' })
export class FolderApiService {
  // --- Instance 1 Data (e.g. User 1) ---
  fetchSessions1(): Observable<SessionNode[]> {
    const tree: SessionNode[] = [
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
    ];
    return of(tree).pipe(delay(150));
  }

  fetchLayouts1(): Observable<LayoutInstance[]> {
    const layouts: LayoutInstance[] = [
      { id: 'v-001', name: 'EUR/USD intraday', lastUpdated: '2026-04-29T08:12:00Z', lastViewDate: '2026-05-03T14:01:00Z' },
      { id: 'v-002', name: 'FX volatility surface', lastUpdated: '2026-04-22T10:30:00Z', lastViewDate: '2026-05-01T09:45:00Z' },
      { id: 'v-003', name: 'CAC 40 momentum', lastUpdated: '2026-05-02T16:00:00Z', lastViewDate: '2026-05-04T07:30:00Z' },
      { id: 'v-004', name: 'S&P sector heatmap', lastUpdated: '2026-04-15T12:00:00Z', lastViewDate: '2026-04-28T11:20:00Z' },
      { id: 'v-005', name: 'VaR by book', lastUpdated: '2026-05-03T18:45:00Z', lastViewDate: '2026-05-04T08:15:00Z' },
      { id: 'v-006', name: 'Stress scenarios Q2', lastUpdated: '2026-04-30T11:00:00Z', lastViewDate: '2026-05-02T13:00:00Z' },
      { id: 'v-007', name: 'Daily P&L summary', lastUpdated: '2026-05-04T06:00:00Z', lastViewDate: '2026-05-04T09:00:00Z' },
      
      // Data not present in sessions1 (Will be grouped under "Others")
      { id: 'v-other1', name: 'John Doe Report', lastUpdated: '2026-05-04T10:12:00Z', lastViewDate: '2026-05-04T10:15:00Z', username: 'John', description: 'Daily report' },
      { id: 'v-other2', name: 'John Doe Summary', lastUpdated: '2026-05-04T11:30:00Z', lastViewDate: '2026-05-04T11:45:00Z', username: 'John', description: 'Summary data' },
      { id: 'v-other3', name: 'Alice Draft', lastUpdated: '2026-05-03T16:00:00Z', lastViewDate: '2026-05-04T09:30:00Z', username: 'Alice', description: 'Working draft' },
      { id: 'v-other4', name: 'Unknown Data', lastUpdated: '2026-05-03T16:00:00Z', lastViewDate: '2026-05-04T09:30:00Z' },
    ];
    return of(layouts).pipe(delay(120));
  }

  // --- Instance 2 Data (e.g. User 2) ---
  fetchSessions2(): Observable<SessionNode[]> {
    const tree: SessionNode[] = [
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
      { id: 'v-101', name: 'BTC/USDT Volume', lastUpdated: '2026-05-04T10:12:00Z', lastViewDate: '2026-05-04T10:15:00Z' },
      { id: 'v-102', name: 'ETH Gas Tracker', lastUpdated: '2026-05-04T11:30:00Z', lastViewDate: '2026-05-04T11:45:00Z' },
      { id: 'v-103', name: 'Uniswap Liquidity', lastUpdated: '2026-05-03T16:00:00Z', lastViewDate: '2026-05-04T09:30:00Z' },
    ];
    return of(layouts).pipe(delay(200));
  }
}
