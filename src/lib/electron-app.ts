export function isElectronDesktop(): boolean {
  return typeof window !== "undefined" && window.electronAPI?.isDesktop === true;
}

export function quitElectronApp(): void {
  void window.electronAPI?.quitApp();
}
