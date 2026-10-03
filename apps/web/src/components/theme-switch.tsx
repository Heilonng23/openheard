import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

import { saveThemeChoice, type ThemeChoice, useVisitorTheme } from "@/lib/visitor-theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: "dark", dark: "auto", auto: "light" };
const LABEL: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", auto: "Auto (system)" };
const ICON = { light: SunIcon, dark: MoonIcon, auto: MonitorIcon };

// Cycles Light, Dark, Auto on the public board.
export function ThemeSwitch({ workspaceId, fallback }: { workspaceId: string; fallback: "light" | "dark" }) {
  const { choice } = useVisitorTheme(workspaceId, fallback);
  const Icon = ICON[choice];
  const label = `Theme: ${LABEL[choice]}. Switch to ${LABEL[NEXT[choice]].toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={() => saveThemeChoice(workspaceId, NEXT[choice])}
      className="inline-flex size-10 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground md:size-8"
      aria-label={label}
      title={label}
    >
      <Icon className="size-[18px] md:size-4" />
    </button>
  );
}
