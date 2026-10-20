import { useEffect, useRef, useState } from "react";
import { pages, type Page } from "../hooks/useAppRoute";

interface Props {
  context: string;
  page: Page;
  onNavigate: (page: Page) => void;
}

/** Native modal semantics keep focus inside the drawer and the page inert. */
export function NavigationMenu({ context, page, onNavigate }: Props) {
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

  function navigate(destination: Page) {
    close();
    onNavigate(destination);
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
            {(
              [
                [
                  "Organizar",
                  [
                    "fatura",
                    "faturasCartao",
                    "dashboard",
                    "pessoas",
                    "cartoes",
                    "historico",
                  ],
                ],
                [
                  "Compartilhar e backup",
                  ["whatsapp", "exportar", "backup", "importar"],
                ],
                ["Preferências", ["aparencia"]],
              ] as [string, Page[]][]
            ).map(([group, entries]) => (
              <div key={group} className="menu-group">
                <h3>{group}</h3>
                {entries.map((destination) => (
                  <button
                    key={destination}
                    type="button"
                    aria-current={page === destination ? "page" : undefined}
                    onClick={() => navigate(destination)}
                  >
                    {pages[destination]}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <p className="menu-version">Anotar Valores · v1.0</p>
        </div>
      </dialog>
    </>
  );
}
