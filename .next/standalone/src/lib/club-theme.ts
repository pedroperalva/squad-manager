import type { CSSProperties } from "react";
import type { Club } from "@/engine/types";

const MIN_ACCENT_LUMINANCE = 0.42;
const MIN_CONTRAST_DELTA = 0.22;

/** Preto e branco com fundo claro (Corinthians, Santos, Vasco). */
const LIGHT_BW_KIT_SLUGS = new Set(["CORINTHI", "SANTOS", "VSC_GAMA"]);

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized.slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColors(colorA: string, colorB: string, weightB: number): string {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    r1 * (1 - w) + r2 * w,
    g1 * (1 - w) + g2 * w,
    b1 * (1 - w) + b2 * w
  );
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pickLighter(primary: string, secondary: string): string {
  return relativeLuminance(primary) >= relativeLuminance(secondary)
    ? primary
    : secondary;
}

function pickDarker(primary: string, secondary: string): string {
  return relativeLuminance(primary) <= relativeLuminance(secondary)
    ? primary
    : secondary;
}

type ThemeMode = "dark" | "light";

function isBlackAndWhiteKit(primary: string, secondary: string): boolean {
  const l1 = relativeLuminance(primary);
  const l2 = relativeLuminance(secondary);
  const hasBlack = l1 < 0.08 || l2 < 0.08;
  const hasWhite = l1 > 0.88 || l2 > 0.88;
  return hasBlack && hasWhite;
}

/**
 * Cor que vai no fundo: primária do time, exceto kits P&B.
 * Corinthians/Vasco/Santos → branco; demais P&B (Botafogo, Atlético, Newcastle…) → preto.
 */
function backgroundBaseColor(
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  if (slug && LIGHT_BW_KIT_SLUGS.has(slug)) {
    return pickLighter(primary, secondary);
  }
  if (isBlackAndWhiteKit(primary, secondary)) {
    return pickDarker(primary, secondary);
  }
  return primary;
}

function backgroundSample(
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  const base = backgroundBaseColor(slug, primary, secondary);
  return mixColors(base, mixColors(base, secondary, 0.45), 0.55);
}

function chooseThemeMode(
  slug: string | undefined,
  primary: string,
  secondary: string
): ThemeMode {
  if (slug && LIGHT_BW_KIT_SLUGS.has(slug)) return "light";
  if (isBlackAndWhiteKit(primary, secondary)) return "dark";

  return relativeLuminance(backgroundSample(slug, primary, secondary)) > 0.52
    ? "light"
    : "dark";
}

function teamBlend(
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  const base = backgroundBaseColor(slug, primary, secondary);
  return mixColors(base, secondary, 0.42);
}

function buildBackgroundGradient(
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  const base = backgroundBaseColor(slug, primary, secondary);
  const lum = relativeLuminance(base);
  const blend = teamBlend(slug, primary, secondary);

  const start =
    lum > 0.55
      ? mixColors(base, "#ffffff", 0.1)
      : mixColors(base, "#000000", 0.18);
  const mid = mixColors(base, blend, 0.55);
  const end =
    lum > 0.55
      ? mixColors(mixColors(base, secondary, 0.5), "#000000", 0.1)
      : mixColors(mixColors(base, secondary, 0.55), "#000000", 0.32);

  return `linear-gradient(165deg, ${start} 0%, ${mid} 50%, ${end} 100%)`;
}

function pickContrastingColor(
  background: string,
  preferred: string,
  fallbackLight: string,
  fallbackDark: string
): string {
  const bgLum = relativeLuminance(background);
  if (Math.abs(relativeLuminance(preferred) - bgLum) >= MIN_CONTRAST_DELTA) {
    return preferred;
  }
  return bgLum > 0.52 ? fallbackDark : fallbackLight;
}

/** Outra cor do kit (fundo = primária ou regra P&B → texto/accent = parceira). */
function companionKitColor(
  primary: string,
  secondary: string,
  bg: string
): string | null {
  const bgKey = bg.toLowerCase();
  if (bgKey === primary.toLowerCase()) return secondary;
  if (bgKey === secondary.toLowerCase()) return primary;

  const bgLum = relativeLuminance(bg);
  if (bgLum > 0.88) return pickDarker(primary, secondary);
  if (bgLum < 0.12) return pickLighter(primary, secondary);

  return null;
}

function kitAccentColor(
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  const bg = backgroundBaseColor(slug, primary, secondary);
  const companion = companionKitColor(primary, secondary, bg);
  if (companion) return companion;
  return pickContrastingColor(bg, secondary, "#f5f5f5", "#141414");
}

function accentForMode(
  mode: ThemeMode,
  slug: string | undefined,
  primary: string,
  secondary: string
): string {
  const companion = kitAccentColor(slug, primary, secondary);
  const bg = backgroundSample(slug, primary, secondary);

  if (
    mode === "dark" &&
    isBlackAndWhiteKit(primary, secondary) &&
    (!slug || !LIGHT_BW_KIT_SLUGS.has(slug))
  ) {
    return "#FFFFFF";
  }

  if (companion && Math.abs(relativeLuminance(companion) - relativeLuminance(bg)) >= 0.12) {
    return companion;
  }

  if (mode === "dark") {
    if (relativeLuminance(secondary) >= MIN_ACCENT_LUMINANCE) return secondary;
    return mixColors(pickLighter(primary, secondary), "#ffffff", 0.35);
  }

  if (relativeLuminance(companion) <= 0.45 || relativeLuminance(primary) <= 0.45) {
    return companion;
  }
  return mixColors(pickDarker(primary, secondary), "#000000", 0.3);
}

function textColors(mode: ThemeMode): { text: string; muted: string } {
  if (mode === "light") {
    return { text: "#141414", muted: "#3d4450" };
  }
  return { text: "#f2f2f2", muted: "#c5ccd6" };
}

const BASE_THEME_VARS: Record<string, string> = {
  "--ef-bg": "#051205",
  "--ef-bg-gradient":
    "linear-gradient(165deg, #051205 0%, #0d2a0d 50%, #1a3d1a 100%)",
  "--ef-panel-bg": "#0f2410",
  "--ef-border": "#2d5a2d",
  "--ef-text": "#e8f0e0",
  "--ef-text-muted": "#9aab8a",
  "--ef-team-primary": "#f4d03f",
  "--ef-team-secondary": "#008c45",
  "--ef-team-accent": "#f4d03f",
};

/** Tema padrão verde/amarelo — inline para isolar modais do tema do body. */
export function basePanelThemeStyle(): CSSProperties {
  return {
    ...BASE_THEME_VARS,
    color: BASE_THEME_VARS["--ef-text"],
    background: BASE_THEME_VARS["--ef-bg-gradient"],
  } as CSSProperties;
}

export function buildClubThemeVars(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): Record<string, string> {
  const { slug, primaryColor, secondaryColor } = club;
  const mode = chooseThemeMode(slug, primaryColor, secondaryColor);
  const blend = teamBlend(slug, primaryColor, secondaryColor);
  const base = backgroundBaseColor(slug, primaryColor, secondaryColor);
  const { text, muted } = textColors(mode);

  const panelBg =
    mode === "dark"
      ? mixColors(mixColors(base, blend, 0.35), "#000000", 0.38)
      : mixColors(mixColors(base, blend, 0.22), "#ffffff", 0.28);

  const border =
    mode === "dark"
      ? mixColors(mixColors(base, blend, 0.5), "#ffffff", 0.14)
      : mixColors(mixColors(base, blend, 0.4), "#000000", 0.14);

  const gradient = buildBackgroundGradient(slug, primaryColor, secondaryColor);

  return {
    "--ef-theme-mode": mode,
    "--ef-team-primary": primaryColor,
    "--ef-team-secondary": secondaryColor,
    "--ef-team-accent": accentForMode(mode, slug, primaryColor, secondaryColor),
    "--ef-bg": base,
    "--ef-bg-gradient": gradient,
    "--ef-panel-bg": panelBg,
    "--ef-border": border,
    "--ef-text": text,
    "--ef-text-muted": muted,
  };
}

export function clubThemeStyle(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): CSSProperties {
  const vars = buildClubThemeVars(club);
  return {
    ...vars,
    background: vars["--ef-bg-gradient"],
    minHeight: "calc(100vh - 3rem)",
  } as CSSProperties;
}

export function clubShellThemeStyle(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): CSSProperties {
  const vars = buildClubThemeVars(club);
  const { "--ef-bg": _bg, "--ef-bg-gradient": _gradient, ...shellVars } = vars;
  return {
    ...shellVars,
    minHeight: "calc(100vh - 3rem)",
  } as CSSProperties;
}

/** Variáveis de tema para modais/painéis (sem altura de página inteira). */
export function clubPanelThemeStyle(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): CSSProperties {
  return buildClubThemeVars(club) as CSSProperties;
}

export function clubPageBackground(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): string {
  return buildClubThemeVars(club)["--ef-bg-gradient"]!;
}

/** Bloco mandante/visitante: cor de fundo do kit + outra cor do uniforme no texto. */
export function clubKitBlockStyle(
  club: Pick<Club, "slug" | "primaryColor" | "secondaryColor">
): CSSProperties {
  const bg = backgroundBaseColor(club.slug, club.primaryColor, club.secondaryColor);
  const color =
    companionKitColor(club.primaryColor, club.secondaryColor, bg) ??
    pickContrastingColor(bg, club.secondaryColor, "#f5f5f5", "#141414");
  return { backgroundColor: bg, color };
}
