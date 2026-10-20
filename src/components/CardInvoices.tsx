import { formatTimestamp } from "../domain/totals";
import { useState } from "react";
import type { AppData } from "../domain/models";
import {
  formatCents,
  formatItemCount,
  selectCardInvoiceSummary,
} from "../domain/totals";
import { formatReference, isReference } from "../domain/peopleAndInvoices";
import { deletePurchase, setPurchaseReimbursed } from "../domain/purchases";
import { PurchaseEditor } from "./PurchaseEditor";

interface Props {
  data: AppData;
  update: (data: AppData) => boolean;
  writable: boolean;
  reference: string;
  onReference: (reference: string) => void;
  onPerson: (personId: string) => void;
}
export function CardInvoices({
  data,
  update,
  writable,
  reference,
  onReference,
  onPerson,
}: Props) {
  const [selectedCard, setSelectedCard] = useState(data.cards[0]?.id ?? "");
  const cardId = data.cards.some((c) => c.id === selectedCard)
    ? selectedCard
    : (data.cards[0]?.id ?? "");
  const [personId, setPersonId] = useState(data.people[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const summary = selectCardInvoiceSummary(data, cardId, reference);
  const row = summary.purchases.find((row) => row.purchase.id === editing);
  const card = data.cards.find((c) => c.id === cardId);
  function reset() {
    setEditing(null);
    setDeleting(null);
    setNotice("");
  }
  return (
    <section aria-label="Fatura completa do cartão">
      <p>
        Escolha o cartão e o mês. Cada compra aparece uma vez no cartão; em
        compras divididas, o valor é distribuído entre as faturas pessoais.
      </p>
      <div className="filters page-context">
        <div>
          <label htmlFor="invoice-card">Cartão da fatura</label>
          <select
            id="invoice-card"
            value={cardId}
            onChange={(e) => {
              setSelectedCard(e.target.value);
              reset();
            }}
          >
            <option value="" disabled>
              Selecione um cartão
            </option>
            {data.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="card-reference">Mês da fatura</label>
          <input
            id="card-reference"
            type="month"
            min="0001-01"
            max="9999-12"
            value={reference}
            onChange={(e) => {
              onReference(e.target.value);
              reset();
            }}
          />
        </div>
      </div>
      {!card ? (
        <p className="empty">
          Cadastre um cartão no menu Cartões para começar.
        </p>
      ) : !isReference(reference) ? (
        <p role="alert">Selecione um mês e ano válidos.</p>
      ) : (
        <>
          <div className="overview-total">
            <div>
              Total do cartão
              <small>
                {card.name} · {formatReference(reference)} ·{" "}
                {formatItemCount(summary.purchaseCount)}
              </small>
              <small>
                Última atualização: {formatTimestamp(summary.updatedAt)}
              </small>
            </div>
            <strong>{formatCents(summary.totalCents)}</strong>
          </div>
          {data.people.length ? (
            <>
              {!row && (
                <div className="page-context">
                  <label htmlFor="card-purchase-person">
                    Pessoa que fez a compra
                  </label>
                  <select
                    id="card-purchase-person"
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                  >
                    {data.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <PurchaseEditor
                key={`${cardId}/${reference}/${row?.purchase.id ?? personId}`}
                data={data}
                update={update}
                writable={writable}
                personId={row?.person.id ?? personId}
                reference={reference}
                fixedCardId={cardId}
                purchase={row?.purchase}
                onDone={() => setEditing(null)}
              />
            </>
          ) : (
            <p className="empty">
              Cadastre uma pessoa no menu Pessoas para identificar as compras.
            </p>
          )}
          <h2>Totais por pessoa</h2>
          <div className="history-list">
            {summary.groups.map((group) => (
              <button
                key={group.person.id}
                onClick={() => onPerson(group.person.id)}
              >
                {group.person.name}
                <span>
                  {formatItemCount(group.purchaseCount)} ·{" "}
                  {formatCents(group.subtotalCents)}
                </span>
              </button>
            ))}
          </div>
          <h2>Compras do cartão</h2>
          {!summary.purchases.length && (
            <p className="card-empty">Nenhuma compra neste cartão e mês.</p>
          )}
          <ul className="purchases">
            {summary.purchases.map(({ purchase: p, person }) => (
              <li
                className={`purchase-row${p.reimbursed ? " purchase-reimbursed" : ""}`}
                key={p.id}
              >
                <div>
                  <strong>
                    {p.description}
                    {p.reimbursed ? " (reembolsada/estornada)" : ""}
                  </strong>
                  <small>Registrada em: {formatTimestamp(p.createdAt)}</small>
                  <small>
                    {(
                      p.participants ?? [
                        { personId: person.id, amountCents: p.amountCents },
                      ]
                    )
                      .map((participant) => {
                        const participantPerson = data.people.find(
                          (item) => item.id === participant.personId,
                        );
                        return `${participantPerson?.name ?? "Pessoa"} ${formatCents(BigInt(participant.amountCents))}`;
                      })
                      .join(" · ")}{" "}
                    ·{" "}
                    {p.installment
                      ? `Parcela ${p.installment.current}/${p.installment.total}`
                      : "À vista"}
                  </small>
                </div>
                <span>{formatCents(BigInt(p.amountCents))}</span>
                <div className="purchase-item-actions">
                  <button
                    disabled={!writable}
                    onClick={() =>
                      update(setPurchaseReimbursed(data, p.id, !p.reimbursed))
                    }
                  >
                    {p.reimbursed ? "Desmarcar estorno" : "Marcar estorno"}
                  </button>
                  <button
                    disabled={!writable}
                    aria-label={`Editar compra ${p.description}`}
                    onClick={() => {
                      setEditing(p.id);
                      setDeleting(null);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    disabled={!writable}
                    aria-label={`Excluir compra ${p.description}`}
                    onClick={() => setDeleting(p.id)}
                  >
                    Excluir
                  </button>
                </div>
                {deleting === p.id && (
                  <div className="purchase-delete">
                    <p>
                      Excluir “{p.description}” da fatura do cartão e da pessoa?
                    </p>
                    <button
                      className="danger"
                      disabled={!writable}
                      onClick={() => {
                        try {
                          if (
                            update(
                              deletePurchase(data, person.id, reference, p.id),
                            )
                          ) {
                            reset();
                            setNotice(
                              "Compra excluída. Totais atualizados nas duas visões.",
                            );
                          }
                        } catch (e) {
                          setNotice(
                            e instanceof Error
                              ? e.message
                              : "Não foi possível excluir.",
                          );
                        }
                      }}
                    >
                      Confirmar exclusão
                    </button>
                    {p.installmentSeriesId && (
                      <button
                        className="danger"
                        disabled={!writable}
                        onClick={() => {
                          try {
                            if (
                              update(
                                deletePurchase(
                                  data,
                                  person.id,
                                  reference,
                                  p.id,
                                  "following",
                                ),
                              )
                            )
                              reset();
                          } catch (e) {
                            setNotice(
                              e instanceof Error
                                ? e.message
                                : "Não foi possível excluir.",
                            );
                          }
                        }}
                      >
                        Excluir esta e as próximas
                      </button>
                    )}
                    <button onClick={() => setDeleting(null)}>Cancelar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
