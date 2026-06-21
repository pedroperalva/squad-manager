export {};

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean;
      quitApp: () => Promise<void>;
    };
  }
}
