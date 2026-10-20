import { useMemo, useState } from "react";
import type { AppData } from "../domain/models";
import { formatCents } from "../domain/cards";
import {
  emptyDashboardFilters,
  getDashboardAnalytics,
  sortAnalyticsRows,
  type DashboardFilters,
  type DashboardPurchase,
} from "../domain/analytics";
interface Props {
  data: AppData;
}
const monthLabel = (reference: string) => {
  const [year, month] = reference.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};
function BarList({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: {
    id: string;
    name: string;
    totalCents: bigint;
    purchaseCount: number;
    sharePercent: number;
  }[];
  onSelect: (id: string) => void;
}) {
  const max = rows.reduce(
    (m, row) => (row.totalCents > m ? row.totalCents : m),
    0n,
  );
  return (
    <section className="dashboard-panel">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="dashboard-bars">
          {rows.map((row) => (
            <button
              className="dashboard-bar-row"
              key={row.id}
              onClick={() => onSelect(row.id)}
              title={`Filtrar por ${row.name}`}
            >
              <span className="dashboard-bar-label">
                {row.name}
                <small>
                  {row.purchaseCount} compras ·{" "}
                  {row.sharePercent.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}
                  %
                </small>
              </span>
              <span className="dashboard-bar-track">
                <span
                  style={{
                    width: `${max ? Math.max(2, Number((row.totalCents * 100n) / max)) : 0}%`,
                  }}
                />
              </span>
              <strong>{formatCents(row.totalCents)}</strong>
            </button>
          ))}
        </div>
      ) : (
        <p className="dashboard-muted">Sem dados para exibir.</p>
      )}
    </section>
  );
}
export function Dashboard({ data }: Props) {
  const [filters, setFilters] = useState<DashboardFilters>(() =>
    emptyDashboardFilters(),
  );
  const [sort, setSort] = useState<"value-desc" | "value-asc" | "count">(
    "value-desc",
  );
  const [selected, setSelected] = useState<DashboardPurchase[] | null>(null);
  const analytics = useMemo(
    () => getDashboardAnalytics(data, filters),
    [data, filters],
  );
  const people = useMemo(
    () => sortAnalyticsRows(analytics.byPerson, sort),
    [analytics.byPerson, sort],
  );
  const cards = useMemo(
    () => sortAnalyticsRows(analytics.byCard, sort),
    [analytics.byCard, sort],
  );
  const update = (next: Partial<DashboardFilters>) =>
    setFilters((current) => ({ ...current, ...next }));
  const setMulti = (key: "people" | "cards", values: string[]) =>
    setFilters((current) => ({ ...current, [key]: values }));
  const activeCount =
    Number(!!filters.from) +
    Number(!!filters.to) +
    filters.people.length +
    filters.cards.length +
    Number(filters.purchaseType !== "all") +
    Number(filters.status !== "active") +
    Number(filters.minCents !== null) +
    Number(filters.maxCents !== null);
  const filtered = (predicate: (p: DashboardPurchase) => boolean) =>
    setSelected(analytics.purchases.filter(predicate));
  return (
    <div className="dashboard">
      <section className="dashboard-filters" aria-label="Filtros do dashboard">
        <div className="dashboard-filter-grid">
          <div>
            <label htmlFor="dash-from">De</label>
            <input
              id="dash-from"
              type="month"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="dash-to">Até</label>
            <input
              id="dash-to"
              type="month"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="dash-people">Pessoas</label>
            <select
              id="dash-people"
              multiple
              value={filters.people}
              onChange={(e) =>
                setMulti(
                  "people",
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-cards">Cartões</label>
            <select
              id="dash-cards"
              multiple
              value={filters.cards}
              onChange={(e) =>
                setMulti(
                  "cards",
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {data.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-type">Tipo de compra</label>
            <select
              id="dash-type"
              value={filters.purchaseType}
              onChange={(e) =>
                update({
                  purchaseType: e.target
                    .value as DashboardFilters["purchaseType"],
                })
              }
            >
              <option value="all">Todas</option>
              <option value="single">À vista</option>
              <option value="installment">Parceladas</option>
            </select>
          </div>
          <div>
            <label htmlFor="dash-status">Status</label>
            <select
              id="dash-status"
              value={filters.status}
              onChange={(e) =>
                update({ status: e.target.value as DashboardFilters["status"] })
              }
            >
              <option value="active">Ativas</option>
              <option value="all">Todas</option>
              <option value="reimbursed">Estornadas/reembolsadas</option>
            </select>
          </div>
          <div>
            <label htmlFor="dash-min">Valor mínimo (R$)</label>
            <input
              id="dash-min"
              inputMode="decimal"
              placeholder="Sem mínimo"
              value={
                filters.minCents === null
                  ? ""
                  : (filters.minCents / 100).toFixed(2).replace(".", ",")
              }
              onChange={(e) => {
                const n = Number(
                  e.target.value.replace(/\./g, "").replace(",", "."),
                );
                update({
                  minCents: e.target.value ? Math.round(n * 100) : null,
                });
              }}
            />
          </div>
          <div>
            <label htmlFor="dash-max">Valor máximo (R$)</label>
            <input
              id="dash-max"
              inputMode="decimal"
              placeholder="Sem máximo"
              value={
                filters.maxCents === null
                  ? ""
                  : (filters.maxCents / 100).toFixed(2).replace(".", ",")
              }
              onChange={(e) => {
                const n = Number(
                  e.target.value.replace(/\./g, "").replace(",", "."),
                );
                update({
                  maxCents: e.target.value ? Math.round(n * 100) : null,
                });
              }}
            />
          </div>
        </div>
        <div className="dashboard-filter-actions">
          <span>
            {activeCount
              ? `${activeCount} filtro(s) aplicado(s)`
              : "Visão geral · últimos 6 meses"}
          </span>
          <button
            onClick={() => {
              setFilters(emptyDashboardFilters());
              setSelected(null);
            }}
          >
            Limpar filtros
          </button>
        </div>
      </section>
      {analytics.purchases.length === 0 ? (
        <section className="dashboard-empty">
          <h2>Nenhuma compra encontrada</h2>
          <p>Nenhuma compra encontrada para os filtros selecionados.</p>
          <button onClick={() => setFilters(emptyDashboardFilters())}>
            Limpar filtros
          </button>
        </section>
      ) : (
        <>
          <section
            className="dashboard-kpis"
            aria-label="Indicadores do período"
          >
            <article>
              <span>Total gasto</span>
              <strong>{formatCents(analytics.totalCents)}</strong>
              <small>{analytics.purchaseCount} compras ativas</small>
            </article>
            <article>
              <span>Pessoas com compras</span>
              <strong>{analytics.peopleCount}</strong>
            </article>
            <article>
              <span>Cartões utilizados</span>
              <strong>{analytics.cardsCount}</strong>
            </article>
            <article>
              <span>Ticket médio</span>
              <strong>{formatCents(analytics.averageCents)}</strong>
            </article>
            <article>
              <span>Maior pessoa</span>
              <strong>{analytics.leadingPerson?.name ?? "—"}</strong>
              <small>
                {analytics.leadingPerson
                  ? formatCents(analytics.leadingPerson.totalCents)
                  : ""}
              </small>
            </article>
            <article>
              <span>Maior cartão</span>
              <strong>{analytics.leadingCard?.name ?? "—"}</strong>
              <small>
                {analytics.leadingCard
                  ? formatCents(analytics.leadingCard.totalCents)
                  : ""}
              </small>
            </article>
            <article>
              <span>Maior compra</span>
              <strong>
                {analytics.largestPurchase
                  ? formatCents(BigInt(analytics.largestPurchase.amountCents))
                  : "—"}
              </strong>
              <small>{analytics.largestPurchase?.description ?? ""}</small>
            </article>
          </section>
          {analytics.purchases.some((p) => p.reimbursed) &&
            filters.status !== "reimbursed" && (
              <p className="dashboard-note">
                Estornos e reembolsos são excluídos dos valores padrão.{" "}
                {analytics.purchases.filter((p) => p.reimbursed).length}{" "}
                lançamento(s) estornado(s) no recorte.
              </p>
            )}
          <div className="dashboard-two-columns">
            <BarList
              title="Gastos por cartão"
              rows={cards}
              onSelect={(id) =>
                update({
                  cards: filters.cards.includes(id)
                    ? filters.cards.filter((x) => x !== id)
                    : [id],
                })
              }
            />
            <BarList
              title="Gastos por pessoa"
              rows={people}
              onSelect={(id) =>
                update({
                  people: filters.people.includes(id)
                    ? filters.people.filter((x) => x !== id)
                    : [id],
                })
              }
            />
          </div>
          <section className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <h2>Evolução mensal</h2>
                <p className="dashboard-muted">
                  Compras lançadas em cada competência
                </p>
              </div>
              <label className="dashboard-sort">
                Ordenar rankings
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="value-desc">Maior valor</option>
                  <option value="value-asc">Menor valor</option>
                  <option value="count">Quantidade</option>
                </select>
              </label>
            </div>
            {analytics.months.length ? (
              <div className="dashboard-months">
                {analytics.months.map((month) => {
                  const max = analytics.months.reduce(
                    (m, row) => (row.totalCents > m ? row.totalCents : m),
                    0n,
                  );
                  return (
                    <button
                      key={month.reference}
                      className="dashboard-month"
                      onClick={() => {
                        update({ from: month.reference, to: month.reference });
                        filtered((p) => p.reference === month.reference);
                      }}
                    >
                      <span>{monthLabel(month.reference)}</span>
                      <i>
                        <b
                          style={{
                            height: `${max ? Math.max(3, Number((month.totalCents * 100n) / max)) : 3}%`,
                          }}
                        />
                      </i>
                      <strong>{formatCents(month.totalCents)}</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="dashboard-muted">
                Escolha um intervalo de competências para ver a evolução.
              </p>
            )}
          </section>
          <section className="dashboard-panel">
            <h2>Pessoa × cartão</h2>
            <div className="dashboard-table-wrap">
              <table className="dashboard-matrix">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    {analytics.byCard.map((card) => (
                      <th key={card.id}>
                        <button
                          className="dashboard-table-filter"
                          onClick={() => update({ cards: [card.id] })}
                        >
                          {card.name}
                        </button>
                      </th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.personCard.map(({ person, cards: rowCards }) => (
                    <tr key={person.id}>
                      <th>
                        <button
                          className="dashboard-table-filter"
                          onClick={() => update({ people: [person.id] })}
                        >
                          {person.name}
                        </button>
                      </th>
                      {rowCards.map(({ card, totalCents }) => (
                        <td key={card.id}>{formatCents(totalCents)}</td>
                      ))}
                      <td>
                        <strong>{formatCents(person.totalCents)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Total</th>
                    {analytics.byCard.map((card) => (
                      <td key={card.id}>
                        <strong>{formatCents(card.totalCents)}</strong>
                      </td>
                    ))}
                    <td>
                      <strong>{formatCents(analytics.totalCents)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          <section className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <h2>Compras consideradas</h2>
                <p className="dashboard-muted">
                  {analytics.purchases.length} lançamentos no filtro atual
                </p>
              </div>
              <button onClick={() => setSelected(analytics.purchases)}>
                Ver detalhes
              </button>
            </div>
            <div className="dashboard-details-list">
              {analytics.purchases.slice(0, 5).map((p) => (
                <button
                  className={
                    p.reimbursed
                      ? "dashboard-detail reimbursed"
                      : "dashboard-detail"
                  }
                  key={p.id}
                  onClick={() => setSelected([p])}
                >
                  <span>
                    <strong>{p.description}</strong>
                    <small>
                      {p.personName} · {p.cardName} · {monthLabel(p.reference)}
                      {p.installment
                        ? ` · parcela ${p.installment.current}/${p.installment.total}`
                        : ""}
                      {p.reimbursed ? " · estornada/reembolsada" : ""}
                    </small>
                  </span>
                  <strong>{formatCents(BigInt(p.amountCents))}</strong>
                </button>
              ))}
            </div>
            {analytics.purchases.length > 5 && (
              <button
                className="dashboard-all-details"
                onClick={() => setSelected(analytics.purchases)}
              >
                Mostrar todas
              </button>
            )}
          </section>
        </>
      )}
      {selected !== null && (
        <div
          className="dashboard-modal-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <section
            className="dashboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-panel-heading">
              <h2 id="dashboard-modal-title">Detalhes das compras</h2>
              <button
                aria-label="Fechar detalhes"
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
            </div>
            {selected.length ? (
              <div className="dashboard-details-list">
                {selected.map((p) => (
                  <div
                    className={
                      p.reimbursed
                        ? "dashboard-detail reimbursed"
                        : "dashboard-detail"
                    }
                    key={p.id}
                  >
                    <span>
                      <strong>{p.description}</strong>
                      <small>
                        {p.personName} · {p.cardName} ·{" "}
                        {monthLabel(p.reference)}
                        {p.installment
                          ? ` · parcela ${p.installment.current}/${p.installment.total}`
                          : ""}
                        {p.reimbursed
                          ? " · estornada/reembolsada (fora dos totais)"
                          : ""}
                      </small>
                    </span>
                    <strong>{formatCents(BigInt(p.amountCents))}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhum lançamento.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
