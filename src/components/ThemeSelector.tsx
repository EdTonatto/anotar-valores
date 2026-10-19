import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export const THEME_KEY = "anotar-valores:theme";

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function useThemePreference() {
  const [preference, setPreference] = useState(readPreference);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.dataset.theme =
        preference === "system"
          ? media?.matches
            ? "dark"
            : "light"
          : preference;
    }
    apply();
    media?.addEventListener("change", apply);
    function sync(event: StorageEvent) {
      if (event.key === THEME_KEY || event.key === null)
        setPreference(readPreference());
    }
    window.addEventListener("storage", sync);
    return () => {
      media?.removeEventListener("change", apply);
      window.removeEventListener("storage", sync);
    };
  }, [preference]);

  function change(value: ThemePreference) {
    setPreference(value);
    try {
      window.localStorage.setItem(THEME_KEY, value);
    } catch {
      // The selection still works for this session if persistence is blocked.
    }
  }

  return { preference, change };
}

export function ThemeSelector({
  preference,
  change,
}: ReturnType<typeof useThemePreference>) {
  return (
    <label className="theme-control">
      Tema
      <select
        value={preference}
        onChange={(event) => change(event.target.value as ThemePreference)}
      >
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
    </label>
  );
}
