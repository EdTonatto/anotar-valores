import { useEffect, useRef, useState } from "react";
import { ThemeSelector } from "./ThemeSelector";
import type { ReportAction } from "./Reports";

interface Props {
  context: string;
  hasPerson: boolean;
  hasContext: boolean;
  hasInvoice: boolean;
  writable: boolean;
  onReport: (action: ReportAction) => void;
}

/** Native modal semantics keep focus inside the drawer and the page inert. */
export function NavigationMenu({
  context,
  hasPerson,
  hasContext,
  hasInvoice,
  writable,
  onReport,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(id: string) {
    close();
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }

  function report(action: ReportAction) {
    navigate("reports-title");
    onReport(action);
  }

  return (
    <>
      <button
        ref={trigger}
        className="menu-trigger"
        type="button"
        aria-label="Abrir menu"
        aria-controls="navigation-menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <span className="hamburger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <dialog
        id="navigation-menu"
        className="navigation-menu"
        ref={dialog}
        aria-labelledby="menu-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="menu-panel">
          <div className="menu-heading">
            <h2 id="menu-title">Menu</h2>
            <button
              type="button"
              autoFocus
              onClick={close}
              aria-label="Fechar menu"
            >
              ✕
            </button>
          </div>
          <p className="menu-context">{context}</p>
          <nav aria-label="Menu principal">
            <h3>Organizar</h3>
            <button type="button" onClick={() => navigate("workspace-title")}>
              Fatura atual
            </button>
            <button type="button" onClick={() => navigate("person")}>
              Pessoas e faturas
            </button>
            <button type="button" onClick={() => navigate("cards-title")}>
              Cartões e compras
            </button>
            <button
              type="button"
              disabled={!hasPerson}
              onClick={() => navigate("history-title")}
            >
              Histórico de faturas
            </button>
            <h3>Compartilhar e backup</h3>
            <button
              type="button"
              disabled={!hasContext}
              onClick={() => report("whatsapp")}
            >
              Copiar para WhatsApp
            </button>
            <button
              type="button"
              disabled={!hasInvoice}
              onClick={() => report("copy-invoice")}
            >
              Copiar JSON da fatura
            </button>
            <button
              type="button"
              disabled={!hasInvoice}
              onClick={() => report("view-invoice")}
            >
              Ver JSON da fatura
            </button>
            <button type="button" onClick={() => report("backup")}>
              Copiar backup completo
            </button>
            <button
              type="button"
              disabled={!writable}
              onClick={() => navigate("import-json")}
            >
              Importar JSON
            </button>
          </nav>
          <h3>Aparência</h3>
          <ThemeSelector />
          <p className="menu-version">Anotar Valores · v1.0</p>
        </div>
      </dialog>
    </>
  );
}
