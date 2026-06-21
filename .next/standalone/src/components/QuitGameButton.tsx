"use client";

import { useSyncExternalStore } from "react";
import { isElectronDesktop, quitElectronApp } from "@/lib/electron-app";

type QuitGameButtonProps = {
  variant?: "landing" | "game";
  className?: string;
};

function subscribeDesktopAvailability(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("focus", onStoreChange);
  return () => window.removeEventListener("focus", onStoreChange);
}

function getDesktopSnapshot() {
  return isElectronDesktop();
}

function getDesktopServerSnapshot() {
  return false;
}

export default function QuitGameButton({
  variant = "game",
  className = "",
}: QuitGameButtonProps) {
  const isDesktop = useSyncExternalStore(
    subscribeDesktopAvailability,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );

  if (!isDesktop) return null;

  const baseClass =
    variant === "landing"
      ? "ef-landing-btn-secondary"
      : "ef-btn border border-[var(--ef-border)]";

  return (
    <button
      type="button"
      className={`${baseClass} ${className}`.trim()}
      onClick={quitElectronApp}
    >
      Sair do jogo
    </button>
  );
}
