export type SessionNodeKind = 'folder' | 'file';

export type FileNode = {
  kind: 'file';
  id: string;
}

export type FolderNode = {
  kind: 'folder';
  name: string;
  id: string;
  children: SessionNode[];
}

export type SessionNode = FileNode | FolderNode

export interface Layout {
  id: string;
  name: string;
  lastUpdated: string;
  lastViewDate: string;
  username?: string;
  description?: string;
}

export interface NodeData {
  id: string;
  kind: SessionNodeKind;
  layout?: Layout;
  isOther?: boolean;  
}

export function isFolderNode(node: SessionNode): node is FolderNode {
  return node.kind === 'folder';
}

export function isFileNode(node: SessionNode): node is FileNode {
  return node.kind === 'file';
}
