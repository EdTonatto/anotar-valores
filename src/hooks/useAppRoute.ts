import { useEffect, useState } from "react";

export const pages = {
  fatura: "Fatura por pessoa",
  pessoas: "Pessoas",
  faturasCartao: "Faturas por cartão",
  cartoes: "Cartões",
  historico: "Histórico de faturas",
  whatsapp: "WhatsApp",
  exportar: "Exportar JSON da fatura",
  backup: "Backup completo",
  importar: "Importar JSON",
  aparencia: "Aparência",
  dashboard: "Dashboard",
} as const;
export type Page = keyof typeof pages;
interface Route {
  page: Page;
  personId: string | null;
  reference: string | null;
}
export function readRoute(): Route {
  const [path, query = ""] = window.location.hash
    .replace(/^#\/?/, "")
    .split("?");
  const params = new URLSearchParams(query);
  return {
    page: Object.hasOwn(pages, path) ? (path as Page) : "fatura",
    personId: params.get("pessoa"),
    reference: params.get("mes"),
  };
}

/** Hash routes work on GitHub Pages without server-side URL rewrites. */
export function useAppRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  function navigate(
    page: Page,
    personId: string,
    reference: string,
    replace = false,
  ) {
    const query = new URLSearchParams({ pessoa: personId, mes: reference });
    const url = `#/${page}?${query}`;
    if (window.location.hash !== url) {
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
    }
    setRoute({ page, personId, reference });
  }
  return { ...route, navigate };
}
