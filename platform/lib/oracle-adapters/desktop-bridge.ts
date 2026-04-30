/**
 * Desktop-bridge adapter — Oracle Bot is a web app, not Electron.
 * All these are no-ops; kept so the bundle's UI components compile if/when ported.
 */
export function isDesktop(): boolean {
  return false;
}

export function desktopNotify(_title: string, _body?: string): void {
  /* no-op */
}

export async function revealInFinder(_absPath: string): Promise<void> {
  /* no-op */
}
