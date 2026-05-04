export type SessionNodeKind = 'folder' | 'file';

export interface SessionNode {
  id: string;
  kind: SessionNodeKind;
  name?: string;
  children?: SessionNode[];
}

export interface Layout {
  id: string;
  name: string;
  lastUpdated: string;
  lastViewDate: string;
}

export interface NodeData {
  id: string;
  kind: SessionNodeKind;
  layout?: Layout;
}
