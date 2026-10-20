import { formatTimestamp } from "../domain/totals";
import { CardInvoices } from "./CardInvoices";
import { NavigationMenu } from "./NavigationMenu";
import { Reports } from "./Reports";
import { ThemeSelector, useThemePreference } from "./ThemeSelector";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatItemCount, selectInvoiceSummary } from "../domain/totals";
import { formatCents } from "../domain/cards";
import { Cards, type CardsHandle } from "./Cards";
import { useAppData } from "../hooks/useAppData";
import { pages, useAppRoute, type Page } from "../hooks/useAppRoute";
import {
  currentReference,
  ensureInvoice,
  formatReference,
  isReference,
  savePerson,
  selectInvoice,
} from "../domain/peopleAndInvoices";

export function App() {
  const { data, update, error, writable } = useAppData();
  const route = useAppRoute();
  const { page } = route;
  const personId = route.personId ?? data.people[0]?.id ?? "";
  const reference = route.reference ?? currentReference();
  const cards = useRef<CardsHandle>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const theme = useThemePreference();
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const person = data.people.find((p) => p.id === personId);
  const { invoice } = selectInvoice(data, personId, reference);
  const summary = selectInvoiceSummary(data, personId, reference);
  const hasContext = !!person && isReference(reference);
  const history = data.invoices
    .filter((f) => f.personId === personId)
    .sort((a, b) => b.reference.localeCompare(a.reference));

  useEffect(() => {
    document.title = `${pages[page]} · Anotar Valores`;
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "start" });
  }, [page]);

  function navigate(destination: Page) {
    setEditor(null);
    setFormError(null);
    setNotice("");
    route.navigate(destination, personId, reference);
  }
  function setPersonId(id: string) {
    setEditor(null);
    setFormError(null);
    setNotice("");
    route.navigate(page, id, reference, true);
  }
  function setReference(value: string) {
    setNotice("");
    route.navigate(page, personId, value, true);
  }
  function submitPerson(event: FormEvent) {
    event.preventDefault();
    try {
      const result = savePerson(
        data,
        name,
        editor === "edit" ? personId : undefined,
      );
      if (update(result.data)) {
        setPersonId(result.personId);
        setNotice(
          editor === "edit"
            ? "Nome atualizado. O histórico foi preservado."
            : "Pessoa cadastrada.",
        );
      }
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Não foi possível salvar a pessoa.",
      );
    }
  }
  function createInvoice() {
    try {
      if (update(ensureInvoice(data, personId, reference)))
        setNotice("Fatura criada para esta pessoa e competência.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Não foi possível criar a fatura.",
      );
    }
  }
  const showContext = [
    "fatura",
    "historico",
    "whatsapp",
    "exportar",
    "pessoas",
  ].includes(page);
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <header>
        <NavigationMenu
          page={page}
          onNavigate={navigate}
          context={
            person
              ? `${person.name} · ${formatReference(reference)}`
              : "Selecione uma pessoa e um mês"
          }
        />
        <a
          className="brand"
          href="#/fatura"
          onClick={(event) => {
            event.preventDefault();
            navigate("fatura");
          }}
        >
          <span className="logo">
            av<span>·</span>
          </span>
          Anotar Valores
        </a>
        <span className="badge">MVP · v1.0</span>
      </header>
      <main id="main-content" tabIndex={-1} className="page-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ANOTAR VALORES</span>
            <h1 id="page-title" ref={title} tabIndex={-1}>
              {pages[page]}
            </h1>
          </div>
          <span className={writable ? "status" : "status blocked"}>
            {writable
              ? "● Dados salvos neste navegador"
              : "● Gravação bloqueada"}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {showContext && (
          <section
            className="page-context"
            aria-label={
              page === "pessoas" ? "Pessoa selecionada" : "Contexto da fatura"
            }
          >
            <div className="filters">
              <div className="person-field">
                <label htmlFor="person">Pessoa</label>
                <select
                  id="person"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                >
                  <option value="" disabled>
                    Selecione uma pessoa
                  </option>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {page !== "pessoas" && (
                <div>
                  <label htmlFor="reference">Mês da fatura</label>
                  <input
                    id="reference"
                    type="month"
                    min="0001-01"
                    max="9999-12"
                    required
                    value={reference}
                    aria-invalid={!isReference(reference)}
                    aria-describedby={
                      !isReference(reference) ? "reference-error" : undefined
                    }
                    onChange={(e) => setReference(e.target.value)}
                  />
                  {!isReference(reference) && (
                    <span className="field-error" id="reference-error">
                      Selecione um mês e ano válidos.
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        <p className="page-notice" role="status">
          {notice}
        </p>
        {page === "pessoas" && (
          <section className="page-panel" aria-label="Cadastro de pessoas">
            <p>
              Cadastre e renomeie as pessoas que usam os cartões. O histórico
              fica associado à pessoa.
            </p>
            <div className="person-actions">
              <button
                className="primary"
                disabled={!writable}
                onClick={() => {
                  setEditor("new");
                  setName("");
                  setFormError(null);
                }}
              >
                + Nova pessoa
              </button>
              <button
                disabled={!person || !writable}
                onClick={() => {
                  setEditor("edit");
                  setName(person?.name ?? "");
                  setFormError(null);
                }}
              >
                Renomear
              </button>
            </div>
            {editor && (
              <form className="person-editor" onSubmit={submitPerson}>
                <label htmlFor="name">
                  {editor === "new" ? "Cadastrar pessoa" : "Editar nome"}
                </label>
                <div className="editor-row">
                  <input
                    autoFocus
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome da pessoa"
                    required
                    aria-invalid={!!formError}
                    aria-describedby={formError ? "name-error" : undefined}
                  />
                  <button
                    className="primary"
                    disabled={!writable}
                    type="submit"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditor(null);
                      setFormError(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
                {formError && (
                  <p className="field-error" role="alert" id="name-error">
                    {formError}
                  </p>
                )}
              </form>
            )}
            {person && (
              <button
                className="open-invoice"
                onClick={() => navigate("fatura")}
              >
                Abrir fatura de {person.name}
              </button>
            )}
          </section>
        )}
        {page === "fatura" && (
          <>
            {!hasContext ? (
              <div className="empty">
                <h2>
                  {person
                    ? "Escolha o mês da fatura."
                    : "Para quem vamos anotar?"}
                </h2>
                <p>
                  {person
                    ? "Informe um mês e ano válidos."
                    : "Cadastre uma pessoa para começar."}
                </p>
                {!person && (
                  <button
                    className="primary"
                    onClick={() => navigate("pessoas")}
                  >
                    Cadastrar pessoa
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overview-total">
                  <div>
                    Total da fatura
                    <small>
                      {person.name} · {formatReference(reference)} ·{" "}
                      {formatItemCount(summary.purchaseCount)}
                    </small>
                    <small>
                      Última atualização: {formatTimestamp(summary.updatedAt)}
                    </small>
                  </div>
                  <strong>{formatCents(summary.totalCents)}</strong>
                </div>
                <div className="overview-actions">
                  <button
                    className="primary"
                    disabled={!writable || data.cards.length === 0}
                    onClick={() => cards.current?.newPurchase()}
                  >
                    + Nova compra
                  </button>
                  <button onClick={() => navigate("whatsapp")}>WhatsApp</button>
                  {!invoice && (
                    <button disabled={!writable} onClick={createInvoice}>
                      Criar fatura de {formatReference(reference)}
                    </button>
                  )}
                </div>
                {data.cards.length === 0 ? (
                  <div className="empty">
                    <h2>Cadastre seu primeiro cartão.</h2>
                    <button
                      className="primary"
                      onClick={() => navigate("cartoes")}
                    >
                      Cadastrar cartão
                    </button>
                  </div>
                ) : (
                  <Cards
                    ref={cards}
                    mode="invoice"
                    key={`${personId}/${reference}`}
                    data={data}
                    update={update}
                    writable={writable}
                    personId={personId}
                    reference={reference}
                  />
                )}
              </>
            )}
          </>
        )}
        {page === "faturasCartao" && (
          <CardInvoices
            data={data}
            update={update}
            writable={writable}
            reference={reference}
            onReference={setReference}
            onPerson={(id) => route.navigate("fatura", id, reference)}
          />
        )}
        {page === "cartoes" && (
          <Cards
            mode="manage"
            data={data}
            update={update}
            writable={writable}
            personId={personId}
            reference={reference}
          />
        )}
        {page === "historico" && (
          <section className="history" aria-label="Faturas salvas">
            <h2>
              {person ? `Histórico de ${person.name}` : "Selecione uma pessoa"}
            </h2>
            {history.length ? (
              <div className="history-list">
                {history.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setNotice("");
                      route.navigate("fatura", personId, f.reference);
                    }}
                  >
                    {formatReference(f.reference)}
                    <span>
                      {formatItemCount(
                        data.purchases.filter((p) => p.invoiceId === f.id)
                          .length,
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="history-empty">
                As faturas criadas para esta pessoa aparecerão aqui.
              </p>
            )}
            {!person && (
              <button onClick={() => navigate("pessoas")}>
                Cadastrar pessoa
              </button>
            )}
          </section>
        )}
        {(page === "whatsapp" ||
          page === "exportar" ||
          page === "backup" ||
          page === "importar") && (
          <Reports
            key={
              page === "importar" ? page : `${page}/${personId}/${reference}`
            }
            page={page}
            data={data}
            update={update}
            writable={writable}
            personId={personId}
            reference={reference}
            onImported={(id, month) => {
              route.navigate("importar", id, month, true);
              setEditor(null);
            }}
          />
        )}
        {page === "aparencia" && (
          <section className="page-panel" aria-label="Preferência de tema">
            <p>
              Escolha o tema do aplicativo ou acompanhe a aparência do seu
              dispositivo.
            </p>
            <ThemeSelector {...theme} />
          </section>
        )}
        <aside>
          <span aria-hidden="true">ⓘ</span>
          <p>
            Seus dados ficam neste navegador e neste dispositivo. Use o backup
            completo para guardar todas as anotações.
          </p>
        </aside>
        <footer>
          <span>Menos contas de cabeça. Mais clareza.</span>
          <span>Anotar Valores · v1.0.0</span>
        </footer>
      </main>
    </div>
  );
}
