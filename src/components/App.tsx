import { ThemeSelector } from "./ThemeSelector";
import { Reports } from "./Reports";
import { useState, type FormEvent } from "react";
import { Cards } from "./Cards";
import { useAppData } from "../hooks/useAppData";
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
  const [personId, setPersonId] = useState(() => data.people[0]?.id ?? "");
  const [reference, setReference] = useState(currentReference);
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const person = data.people.find((p) => p.id === personId);
  const { invoice, purchases } = selectInvoice(data, personId, reference);
  const history = data.invoices
    .filter((f) => f.personId === personId)
    .sort((a, b) => b.reference.localeCompare(a.reference));
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
        setEditor(null);
        setFormError(null);
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
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <header>
        <a className="brand" href="./">
          <span className="logo">
            av<span>·</span>
          </span>
          Anotar Valores
        </a>
        <div className="header-actions">
          <ThemeSelector />
          <span className="badge">MVP · v1.0</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="eyebrow">
          COMPRAS COMPARTILHADAS, CONTAS ORGANIZADAS
        </div>
        <h1>
          Cada pessoa.
          <br />
          <span>Sua própria fatura.</span>
        </h1>
        <p className="intro">
          Selecione uma pessoa e um mês para organizar as anotações e consultar
          o histórico.
        </p>
        <nav className="quick-nav" aria-label="Atalhos da página">
          <a href="#workspace-title">Pessoa e fatura</a>
          <a href="#cards-title">Cartões e compras</a>
          <a href="#reports-title">WhatsApp e JSON</a>
        </nav>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <section className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-top">
            <div>
              <span className="eyebrow">SEU ESPAÇO</span>
              <h2 id="workspace-title">Pessoas e faturas</h2>
            </div>
            <span className={writable ? "status" : "status blocked"}>
              {writable
                ? "● Dados salvos neste navegador"
                : "● Gravação bloqueada"}
            </span>
          </div>
          <div className="filters">
            <div className="person-field">
              <label htmlFor="person">Pessoa</label>
              <select
                id="person"
                value={personId}
                onChange={(e) => {
                  setPersonId(e.target.value);
                  setEditor(null);
                  setNotice("");
                  setFormError(null);
                }}
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
                onChange={(e) => {
                  setReference(e.target.value);
                  setNotice("");
                }}
              />
              {!isReference(reference) && (
                <span className="field-error" id="reference-error">
                  Selecione um mês e ano válidos.
                </span>
              )}
            </div>
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
                <button className="primary" disabled={!writable} type="submit">
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
          <p className="notice" role="status">
            {notice}
          </p>
          <div className="invoice-heading">
            <div>
              <span className="eyebrow">FATURA SELECIONADA</span>
              <h2>
                {person
                  ? `${person.name} · ${formatReference(reference)}`
                  : "Cadastre sua primeira pessoa"}
              </h2>
            </div>
            {person && isReference(reference) && (
              <span className="pill">
                {invoice ? "Fatura criada" : "Sem fatura neste mês"}
              </span>
            )}
          </div>
          {!person || !isReference(reference) ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">
                ↗
              </div>
              <h3>
                {person
                  ? "Escolha o mês da fatura."
                  : "Para quem vamos anotar?"}
              </h3>
              <p>
                {person
                  ? "Informe mês e ano para consultar as anotações."
                  : "Cadastre uma pessoa para começar a organizar suas faturas."}
              </p>
            </div>
          ) : purchases.length ? (
            <p className="cards-description">
              Consulte as compras agrupadas por cartão abaixo.
            </p>
          ) : (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">
                ↗
              </div>
              <h3>Nenhuma compra neste mês.</h3>
              <p>
                {invoice
                  ? "Adicione compras no formulário dos cartões abaixo."
                  : "Ao salvar uma compra abaixo, a fatura será criada automaticamente. Se preferir, crie uma fatura vazia agora."}
              </p>
              {!invoice && (
                <button
                  className="primary"
                  disabled={!writable}
                  onClick={createInvoice}
                >
                  Criar fatura de {formatReference(reference)}
                </button>
              )}
            </div>
          )}
        </section>
        <Cards
          data={data}
          update={update}
          writable={writable}
          personId={personId}
          reference={reference}
        />
        {person && (
          <section className="history" aria-labelledby="history-title">
            <div>
              <span className="eyebrow">COMPETÊNCIAS SALVAS</span>
              <h2 id="history-title">Histórico de {person.name}</h2>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((f) => (
                  <button
                    key={f.id}
                    aria-pressed={f.reference === reference}
                    onClick={() => {
                      setReference(f.reference);
                      setNotice("");
                    }}
                  >
                    {formatReference(f.reference)}
                    <span>
                      {
                        data.purchases.filter((p) => p.invoiceId === f.id)
                          .length
                      }{" "}
                      compras
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="history-empty">
                As faturas criadas para esta pessoa aparecerão aqui.
              </p>
            )}
          </section>
        )}
        <Reports
          data={data}
          update={update}
          writable={writable}
          personId={personId}
          reference={reference}
          onImported={(id, month) => {
            setPersonId(id);
            setReference(month);
            setEditor(null);
            setNotice("");
          }}
        />
        <aside>
          <span aria-hidden="true">ⓘ</span>
          <p>
            Seus dados ficam neste navegador e neste dispositivo. Não há
            sincronização automática entre dispositivos. Limpar os dados do
            navegador pode remover suas anotações. Use uma aba por vez.
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
