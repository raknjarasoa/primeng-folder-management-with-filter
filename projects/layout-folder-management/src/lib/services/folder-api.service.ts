import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { SessionNode, ViewMeta } from '../models/folder-tree.models';

/**
 * Simulates the two backend endpoints. In production these become two HTTP calls;
 * the store joins them via id.
 */
@Injectable({ providedIn: 'root' })
export class FolderApiService {
  /** GET /sessions — persisted folder structure. */
  fetchSessions(): Observable<SessionNode[]> {
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
      { id: 'v-007', kind: 'file' }, // root-level file
    ];
    return of(tree).pipe(delay(150));
  }

  /** GET /views — flat list of view metadata, joined by id. */
  fetchViews(): Observable<ViewMeta[]> {
    const views: ViewMeta[] = [
      { id: 'v-001', name: 'EUR/USD intraday', lastUpdated: '2026-04-29T08:12:00Z', lastViewed: '2026-05-03T14:01:00Z' },
      { id: 'v-002', name: 'FX volatility surface', lastUpdated: '2026-04-22T10:30:00Z', lastViewed: '2026-05-01T09:45:00Z' },
      { id: 'v-003', name: 'CAC 40 momentum', lastUpdated: '2026-05-02T16:00:00Z', lastViewed: '2026-05-04T07:30:00Z' },
      { id: 'v-004', name: 'S&P sector heatmap', lastUpdated: '2026-04-15T12:00:00Z', lastViewed: '2026-04-28T11:20:00Z' },
      { id: 'v-005', name: 'VaR by book', lastUpdated: '2026-05-03T18:45:00Z', lastViewed: '2026-05-04T08:15:00Z' },
      { id: 'v-006', name: 'Stress scenarios Q2', lastUpdated: '2026-04-30T11:00:00Z', lastViewed: '2026-05-02T13:00:00Z' },
      { id: 'v-007', name: 'Daily P&L summary', lastUpdated: '2026-05-04T06:00:00Z', lastViewed: '2026-05-04T09:00:00Z' },
    ];
    return of(views).pipe(delay(120));
  }
}
