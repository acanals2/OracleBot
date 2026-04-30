/**
 * Lightweight workspace checkpoints. Each checkpoint is a single JSON document
 * capturing every text file in the workspace (node_modules / .next excluded).
 * Restore rewrites the workspace tree to match the checkpoint, deleting any
 * file written after the checkpoint was created.
 *
 * Adapted from the bundle's `oracle-checkpoints.ts`. The only meaningful
 * change is the path resolver — checkpoints live at
 *   <CHECKPOINTS_ROOT>/<workspaceId>/<checkpoint-id>.json
 * instead of being computed from a snapshots dir.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getCheckpointsRoot } from './oracle-adapters/paths';
import {
  getWorkspacePath,
  listWorkspaceFiles,
  readWorkspaceFile,
} from './oracle-workspace';

export interface CheckpointMeta {
  id: string;
  workspaceId: string;
  createdAt: string;
  fileCount: number;
  bytes: number;
  note?: string;
}

const MAX_FILES = 500;
const MAX_FILE_BYTES = 400 * 1024;

function checkpointDir(workspaceId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(workspaceId)) {
    throw new Error(`invalid workspace id: ${workspaceId}`);
  }
  return path.join(getCheckpointsRoot(), workspaceId);
}

function checkpointPath(workspaceId: string, id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`invalid checkpoint id: ${id}`);
  }
  return path.join(checkpointDir(workspaceId), `${id}.json`);
}

function newId(): string {
  const now = new Date();
  const ts =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    String(now.getUTCMilliseconds()).padStart(3, '0');
  return ts + '-' + Math.random().toString(36).slice(2, 6);
}

export async function createCheckpoint(
  workspaceId: string,
  note?: string,
): Promise<{ meta: CheckpointMeta; empty: boolean }> {
  await fs.mkdir(checkpointDir(workspaceId), { recursive: true });
  const files = await listWorkspaceFiles(workspaceId);
  const capped = files.slice(0, MAX_FILES);
  const records: Array<{ path: string; content: string }> = [];
  let bytes = 0;
  for (const f of capped) {
    if (f.bytes > MAX_FILE_BYTES) continue;
    const content = await readWorkspaceFile(workspaceId, f.path);
    if (content === null) continue;
    records.push({ path: f.path, content });
    bytes += Buffer.byteLength(content, 'utf8');
  }
  const id = newId();
  const meta: CheckpointMeta = {
    id,
    workspaceId,
    createdAt: new Date().toISOString(),
    fileCount: records.length,
    bytes,
    note,
  };
  const doc = { meta, files: records };
  await fs.writeFile(checkpointPath(workspaceId, id), JSON.stringify(doc), 'utf8');
  return { meta, empty: records.length === 0 };
}

export async function listCheckpoints(workspaceId: string): Promise<CheckpointMeta[]> {
  const dir = checkpointDir(workspaceId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: CheckpointMeta[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as { meta: CheckpointMeta };
      if (parsed.meta) out.push(parsed.meta);
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export async function restoreCheckpoint(
  workspaceId: string,
  id: string,
): Promise<{ restored: number; deleted: number }> {
  const docPath = checkpointPath(workspaceId, id);
  const raw = await fs.readFile(docPath, 'utf8');
  const doc = JSON.parse(raw) as {
    meta: CheckpointMeta;
    files: Array<{ path: string; content: string }>;
  };
  const workspace = await getWorkspacePath(workspaceId);

  const current = await listWorkspaceFiles(workspaceId);
  const keepSet = new Set(doc.files.map((f) => f.path));

  let deleted = 0;
  for (const f of current) {
    if (keepSet.has(f.path)) continue;
    if (f.path.startsWith('node_modules/') || f.path.startsWith('.next/')) continue;
    try {
      await fs.rm(path.join(workspace, f.path), { force: true });
      deleted += 1;
    } catch {
      /* best-effort */
    }
  }

  let restored = 0;
  for (const f of doc.files) {
    try {
      const target = path.join(workspace, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, f.content, 'utf8');
      restored += 1;
    } catch {
      /* best-effort */
    }
  }

  return { restored, deleted };
}

export async function readCheckpointFiles(
  workspaceId: string,
  id: string,
): Promise<Array<{ path: string; content: string }>> {
  const raw = await fs.readFile(checkpointPath(workspaceId, id), 'utf8');
  const doc = JSON.parse(raw) as { files: Array<{ path: string; content: string }> };
  return doc.files;
}
