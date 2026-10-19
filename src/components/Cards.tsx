import { formatItemCount, selectInvoiceSummary } from "../domain/totals";
import { PurchaseEditor } from "./PurchaseEditor";
import { deletePurchase } from "../domain/purchases";
import {
  useEffect,
  useImperativeHandle,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import type { AppData } from "../domain/models";
import { cardUsage, deleteCard, formatCents, saveCard } from "../domain/cards";
import { formatReference, isReference } from "../domain/peopleAndInvoices";
export interface CardsHandle {
  newPurchase: () => void;
}
interface Props {
  ref?: Ref<CardsHandle>;
  data: AppData;
  update: (next: AppData) => boolean;
  writable: boolean;
  personId: string;
  reference: string;
}
export function Cards({
  ref,
  data,
  update,
  writable,
  personId,
  reference,
}: Props) {
  const [purchaseEdit, setPurchaseEdit] = useState<{
    id: string;
    personId: string;
    reference: string;
  } | null>(null);
  const [purchaseDelete, setPurchaseDelete] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusRequest, setFocusRequest] = useState(0);
  const person = data.people.find((p) => p.id === personId);
  const hasContext = !!person && isReference(reference);
  const { groups, totalCents, purchaseCount } = selectInvoiceSummary(
    data,
    personId,
    reference,
  );
  const editingPurchase =
    purchaseEdit?.personId === personId && purchaseEdit.reference === reference
      ? groups.flatMap((g) => g.purchases).find((p) => p.id === purchaseEdit.id)
      : undefined;
  useEffect(() => {
    if (!focusRequest) return;
    const field = document.getElementById("purchase-description");
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: "center" });
  }, [focusRequest]);
  useImperativeHandle(ref, () => ({
    newPurchase() {
      setPurchaseEdit(null);
      setFocusRequest((request) => request + 1);
    },
  }));
  function removePurchase(id: string) {
    try {
      if (update(deletePurchase(data, personId, reference, id))) {
        setPurchaseDelete(null);
        if (purchaseEdit?.id === id) setPurchaseEdit(null);
        setNotice("Compra excluída. Os subtotais foram atualizados.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível excluir a compra.",
      );
    }
  }
  function beginEdit(id: string, value: string) {
    setEditor(id);
    setName(value);
    setError("");
    setNotice("");
    setPendingDelete(null);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (
        update(
          saveCard(
            data,
            name,
            editor === "new" ? undefined : (editor ?? undefined),
          ),
        )
      ) {
        setEditor(null);
        setError("");
        setNotice(
          "Cartão salvo. O cadastro vale para todas as pessoas e meses.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  function remove(id: string) {
    try {
      if (update(deleteCard(data, id))) {
        setPendingDelete(null);
        setNotice("Cartão excluído.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }
  function toggle(id: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function renderEditor(id: string) {
    return (
      <form className="card-editor" onSubmit={submit}>
        <label htmlFor={`card-name-${id}`}>
          {id === "new" ? "Nome ou apelido do cartão" : "Novo nome do cartão"}
        </label>
        <div className="editor-row">
          <input
            id={`card-name-${id}`}
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Nubank roxo"
            aria-invalid={!!error}
            aria-describedby={error ? "card-error" : undefined}
          />
          <button className="primary" type="submit" disabled={!writable}>
            Salvar cartão
          </button>
          <button
            type="button"
            onClick={() => {
              setEditor(null);
              setError("");
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }
  return (
    <section className="cards-section" aria-labelledby="cards-title">
      <div className="cards-heading">
        <div>
          <span className="eyebrow">CADASTRO COMPARTILHADO</span>
          <h2 id="cards-title" tabIndex={-1}>
            Seus cartões
          </h2>
        </div>
        <button
          className="primary"
          disabled={!writable}
          onClick={() => beginEdit("new", "")}
        >
          + Novo cartão
        </button>
      </div>
      <p className="cards-description">
        Os cartões ficam disponíveis para todas as pessoas e meses.{" "}
        {hasContext
          ? `Compras e subtotais de ${person.name} · ${formatReference(reference)}.`
          : "Selecione uma pessoa e competência para consultar compras e subtotais."}
      </p>
      {hasContext && data.cards.length > 0 && (
        <PurchaseEditor
          key={`${personId}/${reference}/${editingPurchase?.id ?? "new"}`}
          data={data}
          update={update}
          writable={writable}
          personId={personId}
          reference={reference}
          purchase={editingPurchase}
          onDone={() => {
            setPurchaseEdit(null);
            setNotice("Edição encerrada.");
          }}
        />
      )}
      {editor === "new" && renderEditor("new")}
      {error && (
        <p id="card-error" className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="card-notice" role="status">
        {notice}
      </p>
      {groups.length > 0 && (
        <div className="card-toolbar">
          <button onClick={() => setCollapsed(new Set())}>
            Expandir todos
          </button>
          <button
            onClick={() => setCollapsed(new Set(data.cards.map((c) => c.id)))}
          >
            Recolher todos
          </button>
        </div>
      )}
      {!groups.length && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ▤
          </div>
          <h3>Seu primeiro cartão começa aqui.</h3>
          <p>
            Cadastre apenas um nome ou apelido. Não precisamos do número do
            cartão.
          </p>
        </div>
      )}
      <div className="card-list">
        {groups.map(({ card, purchases, subtotalCents }) => {
          const expanded = !collapsed.has(card.id);
          const usage = cardUsage(data, card.id);
          return (
            <article className="card-panel" key={card.id}>
              <div className="card-header">
                <button
                  className="card-toggle"
                  aria-expanded={expanded}
                  aria-controls={`card-content-${card.id}`}
                  onClick={() => toggle(card.id)}
                >
                  <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                  <strong>{card.name}</strong>
                  {hasContext && (
                    <span className="card-item-count">
                      {formatItemCount(purchases.length)}
                    </span>
                  )}
                  {!expanded && hasContext && (
                    <span className="card-amount">
                      {formatCents(subtotalCents)}
                    </span>
                  )}
                </button>
                <div className="card-actions">
                  <button
                    disabled={!writable}
                    onClick={() => beginEdit(card.id, card.name)}
                    aria-label={`Renomear cartão ${card.name}`}
                  >
                    Renomear
                  </button>
                  <button
                    disabled={!writable}
                    onClick={() => {
                      setPendingDelete(card.id);
                      setEditor(null);
                      setError("");
                      setNotice("");
                    }}
                    aria-label={`Excluir cartão ${card.name}`}
                  >
                    Excluir
                  </button>
                </div>
              </div>
              {editor === card.id && renderEditor(card.id)}
              {pendingDelete === card.id && (
                <div
                  className="delete-confirm"
                  role="group"
                  aria-label={`Exclusão de ${card.name}`}
                >
                  <p>
                    {usage.purchases
                      ? `Exclusão bloqueada: este cartão possui ${usage.purchases} compra(s) em ${usage.invoices} fatura(s) de ${usage.people} pessoa(s), considerando todo o histórico. As compras serão preservadas.`
                      : `Excluir o cartão “${card.name}” do cadastro de todas as pessoas e meses? Ele não possui compras vinculadas.`}
                  </p>
                  <div className="card-actions">
                    {!usage.purchases && (
                      <button
                        className="danger"
                        disabled={!writable}
                        onClick={() => remove(card.id)}
                      >
                        Confirmar exclusão
                      </button>
                    )}
                    <button onClick={() => setPendingDelete(null)}>
                      {usage.purchases ? "Fechar" : "Cancelar"}
                    </button>
                  </div>
                </div>
              )}
              <div id={`card-content-${card.id}`} hidden={!expanded}>
                {hasContext ? (
                  <>
                    {purchases.length ? (
                      <ul className="purchases">
                        {purchases.map((p) => (
                          <li key={p.id} className="purchase-row">
                            <div>
                              <strong>{p.description}</strong>
                              <small>
                                {p.installment
                                  ? `Parcela ${p.installment.current}/${p.installment.total}`
                                  : "À vista"}
                              </small>
                            </div>
                            <span>{formatCents(BigInt(p.amountCents))}</span>
                            <div className="purchase-item-actions">
                              <button
                                disabled={!writable}
                                aria-label={`Editar compra ${p.description}`}
                                onClick={() => {
                                  setPurchaseEdit({
                                    id: p.id,
                                    personId,
                                    reference,
                                  });
                                  setPurchaseDelete(null);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                disabled={!writable}
                                aria-label={`Excluir compra ${p.description}`}
                                onClick={() => setPurchaseDelete(p.id)}
                              >
                                Excluir
                              </button>
                            </div>
                            {purchaseDelete === p.id && (
                              <div
                                className="purchase-delete"
                                role="group"
                                aria-label="Confirmar exclusão da compra"
                              >
                                <p>
                                  Excluir “{p.description}” de{" "}
                                  {formatCents(BigInt(p.amountCents))} desta
                                  fatura?
                                </p>
                                <button
                                  className="danger"
                                  disabled={!writable}
                                  onClick={() => removePurchase(p.id)}
                                >
                                  Confirmar exclusão
                                </button>
                                <button onClick={() => setPurchaseDelete(null)}>
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="card-empty">
                        Nenhuma compra neste cartão para a pessoa e o mês
                        selecionados.
                      </p>
                    )}
                    <div className="card-subtotal">
                      <span>Subtotal</span>
                      <strong>{formatCents(subtotalCents)}</strong>
                    </div>
                  </>
                ) : (
                  <p className="card-empty">
                    Selecione uma pessoa e um mês para ver as compras deste
                    cartão.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {hasContext && (
        <div
          className="invoice-total"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>
            Total geral desta fatura
            <small>
              {purchaseCount} compra(s) · {formatReference(reference)}
            </small>
          </span>
          <strong>{formatCents(totalCents)}</strong>
        </div>
      )}
    </section>
  );
}
