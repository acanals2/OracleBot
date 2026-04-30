/**
 * Workspace filesystem helpers — file CRUD with path-traversal guards.
 *
 * Adapted from the bundle's `oracle-workspace.ts`. Core differences:
 *
 *  - Per-user namespacing comes from the DB row (orgId on the `workspaces`
 *    table), not from request-context cookies. This decouples lib code from
 *    Next.js request handling.
 *
 *  - The "tombstone" + per-user cap dance is replaced by simple DB lookups
 *    (the workspace either exists in the `workspaces` table or it doesn't).
 *
 *  - Workspace IDs in this codebase are UUIDs (Drizzle defaultRandom), so the
 *    [A-Za-z0-9._-] regex is preserved (UUIDs match it) but documented.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getWorkspaceDirById, getWorkspaceDirForOrg } from './oracle-adapters/account';

/** Reject ids that aren't UUID-shaped (or otherwise look like path traversal). */
function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`invalid workspace id: ${id}`);
  }
}

export async function resolveWorkspaceDir(workspaceId: string): Promise<string> {
  assertSafeId(workspaceId);
  return getWorkspaceDirById(workspaceId);
}

/** Variant for callers that already loaded the workspace row + know the orgId. */
export function resolveWorkspaceDirForOrg(orgId: string, workspaceId: string): string {
  assertSafeId(workspaceId);
  return getWorkspaceDirForOrg(orgId, workspaceId);
}

async function resolveWorkspaceFile(workspaceId: string, relPath: string): Promise<string> {
  // Reject any traversal in the relative path.
  const normalized = path.posix.normalize(relPath.replace(/\\/g, '/'));
  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`invalid workspace path: ${relPath}`);
  }
  const dir = await resolveWorkspaceDir(workspaceId);
  const resolved = path.resolve(dir, normalized);
  if (!(resolved === dir || resolved.startsWith(dir + path.sep))) {
    throw new Error(`path traversal blocked: ${relPath}`);
  }
  return resolved;
}

const PROJECT_META_FILE = '.oracle-project.json';

export interface ProjectMetadata {
  name?: string;
  createdAt: string;
  updatedAt?: string;
}

async function metadataPath(workspaceId: string): Promise<string> {
  const dir = await resolveWorkspaceDir(workspaceId);
  return path.join(dir, PROJECT_META_FILE);
}

export async function readProjectMetadata(
  workspaceId: string,
): Promise<ProjectMetadata | null> {
  try {
    const raw = await fs.readFile(await metadataPath(workspaceId), 'utf8');
    const parsed = JSON.parse(raw) as ProjectMetadata;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeProjectMetadata(
  workspaceId: string,
  patch: Partial<ProjectMetadata>,
): Promise<ProjectMetadata> {
  const prior = (await readProjectMetadata(workspaceId)) ?? {
    createdAt: new Date().toISOString(),
  };
  const merged: ProjectMetadata = {
    ...prior,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await ensureWorkspace(workspaceId);
  await fs.writeFile(
    await metadataPath(workspaceId),
    JSON.stringify(merged, null, 2),
    'utf8',
  );
  return merged;
}

/** Ensure the workspace directory exists on disk. Caller is responsible for
 *  having already created the DB row — see `lib/workspaces.ts` for that. */
export async function ensureWorkspace(workspaceId: string): Promise<string> {
  const dir = await resolveWorkspaceDir(workspaceId);
  await fs.mkdir(dir, { recursive: true });
  const metaPath = path.join(dir, PROJECT_META_FILE);
  try {
    await fs.access(metaPath);
  } catch {
    const seed: ProjectMetadata = {
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(metaPath, JSON.stringify(seed, null, 2), 'utf8').catch(() => {});
  }
  return dir;
}

export async function writeWorkspaceFile(
  workspaceId: string,
  relPath: string,
  content: string,
): Promise<{ bytes: number; absolutePath: string }> {
  const target = await resolveWorkspaceFile(workspaceId, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return { bytes: Buffer.byteLength(content, 'utf8'), absolutePath: target };
}

export async function writeWorkspaceFileBinary(
  workspaceId: string,
  relPath: string,
  content: Buffer,
): Promise<{ bytes: number; absolutePath: string }> {
  const target = await resolveWorkspaceFile(workspaceId, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return { bytes: content.byteLength, absolutePath: target };
}

export async function readWorkspaceFile(
  workspaceId: string,
  relPath: string,
): Promise<string | null> {
  try {
    const target = await resolveWorkspaceFile(workspaceId, relPath);
    return await fs.readFile(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function deleteWorkspaceFile(
  workspaceId: string,
  relPath: string,
): Promise<boolean> {
  try {
    const target = await resolveWorkspaceFile(workspaceId, relPath);
    await fs.rm(target, { force: true });
    return true;
  } catch {
    return false;
  }
}

export interface WorkspaceFileEntry {
  path: string;
  bytes: number;
  modifiedAt: string;
}

export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileEntry[]> {
  const root = await resolveWorkspaceDir(workspaceId);
  const results: WorkspaceFileEntry[] = [];
  async function walk(dir: string, prefix: string) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === PROJECT_META_FILE) continue;
      // Hard-skip these even if a dotfile-skip somehow misses them.
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat) continue;
        results.push({
          path: rel,
          bytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }
  await walk(root, '');
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

export async function getWorkspacePath(workspaceId: string): Promise<string> {
  return resolveWorkspaceDir(workspaceId);
}

export async function workspaceExists(workspaceId: string): Promise<boolean> {
  try {
    const dir = await resolveWorkspaceDir(workspaceId);
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function clearWorkspace(workspaceId: string): Promise<void> {
  const dir = await resolveWorkspaceDir(workspaceId);
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Seed a workspace with starter Next.js files. Called once on creation.
 * Designed to produce the smallest possible app that boots `next dev`
 * cleanly so the user sees something live in the iframe immediately.
 */
export async function seedDefaultStarter(workspaceId: string): Promise<void> {
  const root = await ensureWorkspace(workspaceId);
  const writes: Array<[string, string]> = [
    [
      'package.json',
      JSON.stringify(
        {
          name: 'oracle-workspace',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '14.2.35',
            react: '18.3.1',
            'react-dom': '18.3.1',
          },
        },
        null,
        2,
      ),
    ],
    [
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2,
      ),
    ],
    [
      'app/layout.tsx',
      `export const metadata = {
  title: 'Oracle workspace',
  description: 'Live preview powered by Oracle Bot.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b0d12', color: '#e6e8ec' }}>
        {children}
      </body>
    </html>
  );
}
`,
    ],
    [
      'app/page.tsx',
      `export default function Home() {
  return (
    <main style={{ padding: 64, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 36, fontWeight: 600, margin: 0 }}>Hello from your workspace</h1>
      <p style={{ marginTop: 16, color: '#9aa0a6' }}>
        Edit <code style={{ background: '#1b1f27', padding: '2px 6px', borderRadius: 4 }}>app/page.tsx</code> and save —
        Oracle Bot will reload the iframe automatically.
      </p>
    </main>
  );
}
`,
    ],
    [
      'next-env.d.ts',
      `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
    ],
  ];
  for (const [rel, content] of writes) {
    const target = path.join(root, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}
