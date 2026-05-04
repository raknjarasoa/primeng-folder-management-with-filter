/**
 * Domain models
 * ----------------------------------------------------------------------------
 * Two API sources feed the tree:
 *   1) Sessions  -> persisted hierarchical structure (folders + file-id refs)
 *   2) Views     -> flat list of view metadata, joined to file nodes by id
 */

/** Discriminator for nodes in the persisted session tree. */
export type SessionNodeKind = 'folder' | 'file';

/** A node in the persisted session tree. Folders have children, files don't. */
export interface SessionNode {
  id: string;
  kind: SessionNodeKind;
  /** Folders only — user-controlled label. Files derive their label from the View. */
  name?: string;
  children?: SessionNode[];
}

/** Flat metadata describing a "view" (i.e. a file leaf in the tree). */
export interface ViewMeta {
  id: string;
  name: string;
  lastUpdated: string; // ISO date
  lastViewed: string;  // ISO date
}

/** What `treeNodes` produces. We attach a typed payload via TreeNode.data. */
export interface NodeData {
  id: string;
  kind: SessionNodeKind;
  /** Only present on file nodes — joined view metadata. */
  view?: ViewMeta;
}
