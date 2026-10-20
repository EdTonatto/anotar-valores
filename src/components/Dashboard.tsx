import { useMemo, useState } from "react";
import type { AppData, Compra } from "../domain/models";
import { formatCents } from "../domain/cards";
import { formatReference } from "../domain/peopleAndInvoices";
import {
  emptyDashboardFilters,
  getDashboardAnalytics,
  listReferences,
  sortAnalyticsRows,
  type DashboardFilters,
  type DashboardPurchase,
} from "../domain/analytics";

interface Props {
  data: AppData;
}
type SortMode = "value-desc" | "value-asc" | "count";
const money = (cents: bigint) => formatCents(cents);
const share = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const typeOf = (purchase: Compra) =>
  purchase.installment ? "Parcelada" : "À vista";

export function Dashboard({ data }: Props) {
  const references = listReferences(data);
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const latest = references.at(-1) ?? "";
    return emptyDashboardFilters(latest);
  });
  const [cardSort, setCardSort] = useState<SortMode>("value-desc");
  const [personSort, setPersonSort] = useState<SortMode>("value-desc");
  const [detail, setDetail] = useState<{
    title: string;
    purchases: DashboardPurchase[];
  } | null>(null);
  const analytics = useMemo(
    () => getDashboardAnalytics(data, filters),
    [data, filters],
  );
  const cards = sortAnalyticsRows(analytics.byCard, cardSort);
  const people = sortAnalyticsRows(analytics.byPerson, personSort);
  const maxCard = cards.reduce(
    (max, row) => (row.totalCents > max ? row.totalCents : max),
    0n,
  );
  const maxPerson = people.reduce(
    (max, row) => (row.totalCents > max ? row.totalCents : max),
    0n,
  );
  const activeFilterCount =
    Number(!!filters.from) +
    Number(!!filters.to) +
    filters.people.length +
    filters.cards.length +
    Number(filters.purchaseType !== "all") +
    Number(filters.status !== "active") +
    Number(filters.minCents !== null) +
    Number(filters.maxCents !== null);

  function update<K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function toggleList(key: "people" | "cards", id: string) {
    const selected = filters[key];
    update(
      key,
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
  }
  function showForCard(id: string, name: string) {
    const selected = getDashboardAnalytics(data, filters).purchases.filter(
      (purchase) => purchase.cardId === id,
    );
    setDetail({ title: `Compras no cartão ${name}`, purchases: selected });
  }
  function showForPerson(id: string, name: string) {
    const selected = getDashboardAnalytics(data, filters).purchases.filter(
      (purchase) => purchase.personId === id,
    );
    setDetail({ title: `Compras de ${name}`, purchases: selected });
  }
  function applyCard(id: string) {
    update("cards", filters.cards.includes(id) ? [] : [id]);
  }
  function applyPerson(id: string) {
    update("people", filters.people.includes(id) ? [] : [id]);
  }
  function clearFilters() {
    setFilters({
      ...emptyDashboardFilters(),
      from: references[0] ?? "",
      to: references.at(-1) ?? "",
    });
    setDetail(null);
  }
  const barWidth = (value: bigint, max: bigint) =>
    max ? Math.max(4, Number((value * 100n) / max)) : 0;

  return (
    <div className="dashboard" aria-label="Dashboard analítico">
      <section className="dashboard-filters" aria-label="Filtros do dashboard">
        <div className="dashboard-section-heading">
          <div>
            <h2>Filtros</h2>
            <p>Os indicadores e gráficos acompanham os mesmos critérios.</p>
          </div>
          <button type="button" onClick={clearFilters}>
            Limpar filtros
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
        <div className="dashboard-filter-grid">
          <div>
            <label htmlFor="dashboard-from">Competência inicial</label>
            <input
              id="dashboard-from"
              type="month"
              min="0001-01"
              max="9999-12"
              value={filters.from}
              onChange={(event) => update("from", event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="dashboard-to">Competência final</label>
            <input
              id="dashboard-to"
              type="month"
              min="0001-01"
              max="9999-12"
              value={filters.to}
              onChange={(event) => update("to", event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="dashboard-type">Tipo de compra</label>
            <select
              id="dashboard-type"
              value={filters.purchaseType}
              onChange={(event) =>
                update(
                  "purchaseType",
                  event.target.value as DashboardFilters["purchaseType"],
                )
              }
            >
              <option value="all">À vista e parceladas</option>
              <option value="single">À vista</option>
              <option value="installment">Parceladas</option>
            </select>
          </div>
          <div>
            <label htmlFor="dashboard-status">Status</label>
            <select
              id="dashboard-status"
              value={filters.status}
              onChange={(event) =>
                update(
                  "status",
                  event.target.value as DashboardFilters["status"],
                )
              }
            >
              <option value="active">Somente ativas</option>
              <option value="all">Ativas e estornadas</option>
              <option value="reimbursed">Somente estornadas</option>
            </select>
          </div>
          <div>
            <label htmlFor="dashboard-min">Valor mínimo (R$)</label>
            <input
              id="dashboard-min"
              inputMode="numeric"
              placeholder="Sem mínimo"
              value={
                filters.minCents === null ? "" : String(filters.minCents / 100)
              }
              onChange={(event) =>
                update(
                  "minCents",
                  event.target.value === ""
                    ? null
                    : Math.max(
                        0,
                        Math.round(
                          Number(event.target.value.replace(",", ".")) * 100,
                        ),
                      ),
                )
              }
            />
          </div>
          <div>
            <label htmlFor="dashboard-max">Valor máximo (R$)</label>
            <input
              id="dashboard-max"
              inputMode="numeric"
              placeholder="Sem máximo"
              value={
                filters.maxCents === null ? "" : String(filters.maxCents / 100)
              }
              onChange={(event) =>
                update(
                  "maxCents",
                  event.target.value === ""
                    ? null
                    : Math.max(
                        0,
                        Math.round(
                          Number(event.target.value.replace(",", ".")) * 100,
                        ),
                      ),
                )
              }
            />
          </div>
        </div>
        <details className="dashboard-multi-filter">
          <summary>
            Pessoas
            {filters.people.length
              ? ` (${filters.people.length} selecionada${filters.people.length > 1 ? "s" : ""})`
              : " · todas"}
          </summary>
          <div className="dashboard-checks">
            {data.people.map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  checked={filters.people.includes(person.id)}
                  onChange={() => toggleList("people", person.id)}
                />
                {person.name}
              </label>
            ))}
          </div>
        </details>
        <details className="dashboard-multi-filter">
          <summary>
            Cartões
            {filters.cards.length
              ? ` (${filters.cards.length} selecionado${filters.cards.length > 1 ? "s" : ""})`
              : " · todos"}
          </summary>
          <div className="dashboard-checks">
            {data.cards.map((card) => (
              <label key={card.id}>
                <input
                  type="checkbox"
                  checked={filters.cards.includes(card.id)}
                  onChange={() => toggleList("cards", card.id)}
                />
                {card.name}
              </label>
            ))}
          </div>
        </details>
        {(filters.people.length > 0 ||
          filters.cards.length > 0 ||
          activeFilterCount > 0) && (
          <div className="dashboard-active-filters" aria-live="polite">
            Filtros ativos: {filters.from || "início"} até{" "}
            {filters.to || "hoje"}
            {filters.people
              .map((id) => data.people.find((p) => p.id === id)?.name)
              .filter(Boolean)
              .join(", ") &&
              ` · ${filters.people
                .map((id) => data.people.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(", ")}`}
            {filters.cards
              .map((id) => data.cards.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(", ") &&
              ` · ${filters.cards
                .map((id) => data.cards.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(", ")}`}
            {filters.status !== "active"
              ? ` · ${filters.status === "all" ? "incluindo estornadas" : "somente estornadas"}`
              : ""}
          </div>
        )}
      </section>

      {analytics.purchases.length === 0 ? (
        <section className="dashboard-empty" role="status">
          <span aria-hidden="true">◌</span>
          <h2>Nenhuma compra encontrada</h2>
          <p>
            Experimente ajustar o período ou remover alguns filtros para ver
            seus dados.
          </p>
          <button type="button" onClick={clearFilters}>
            Limpar filtros
          </button>
        </section>
      ) : (
        <>
          <section
            className="dashboard-kpis"
            aria-label="Indicadores do período"
          >
            <article className="dashboard-kpi dashboard-kpi-primary">
              <span>Valor total gasto</span>
              <strong>{money(analytics.totalCents)}</strong>
              <small>
                {analytics.purchaseCount} compras consideradas
                {filters.status === "all" ? " · inclui estornadas" : ""}
              </small>
            </article>
            <article className="dashboard-kpi">
              <span>Compras ativas</span>
              <strong>{analytics.activeCount}</strong>
              <small>
                {analytics.peopleCount} pessoas · {analytics.cardsCount} cartões
              </small>
            </article>
            <article className="dashboard-kpi">
              <span>Ticket médio</span>
              <strong>{money(analytics.averageCents)}</strong>
              <small>por compra ativa</small>
            </article>
            <article className="dashboard-kpi">
              <span>Maior gasto por pessoa</span>
              <strong>{analytics.leadingPerson?.name ?? "—"}</strong>
              <small>
                {analytics.leadingPerson
                  ? money(analytics.leadingPerson.totalCents)
                  : "Sem compras ativas"}
              </small>
            </article>
            <article className="dashboard-kpi">
              <span>Cartão com maior gasto</span>
              <strong>{analytics.leadingCard?.name ?? "—"}</strong>
              <small>
                {analytics.leadingCard
                  ? money(analytics.leadingCard.totalCents)
                  : "Sem compras ativas"}
              </small>
            </article>
            <article className="dashboard-kpi">
              <span>Maior compra</span>
              <strong>
                {analytics.largestPurchase
                  ? money(BigInt(analytics.largestPurchase.amountCents))
                  : "—"}
              </strong>
              <small>
                {analytics.largestPurchase?.description ?? "Sem compras ativas"}
              </small>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Gastos por cartão</h2>
                  <p>Selecione uma barra para filtrar o dashboard.</p>
                </div>
                <label className="dashboard-sort">
                  Ordenar por
                  <select
                    aria-label="Ordenar cartões"
                    value={cardSort}
                    onChange={(event) =>
                      setCardSort(event.target.value as SortMode)
                    }
                  >
                    <option value="value-desc">Maior valor</option>
                    <option value="value-asc">Menor valor</option>
                    <option value="count">Compras</option>
                  </select>
                </label>
              </div>
              {cards.length ? (
                <div className="dashboard-bars">
                  {cards.map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      className={`dashboard-bar-row${filters.cards.includes(row.id) ? " selected" : ""}`}
                      onClick={() => applyCard(row.id)}
                      onDoubleClick={() => showForCard(row.id, row.name)}
                      title="Clique para filtrar; duplo clique para ver compras"
                    >
                      <span className="dashboard-bar-label">{row.name}</span>
                      <span className="dashboard-bar-track">
                        <span
                          className="dashboard-bar-fill"
                          style={{
                            width: `${barWidth(row.totalCents, maxCard)}%`,
                          }}
                        />
                      </span>
                      <span className="dashboard-bar-value">
                        {money(row.totalCents)}
                        <small>
                          {row.purchaseCount} compras ·{" "}
                          {share(row.sharePercent)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="dashboard-no-data">Sem cartões neste recorte.</p>
              )}
            </section>
            <section className="dashboard-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Gastos por pessoa</h2>
                  <p>Ticket médio e participação no total.</p>
                </div>
                <label className="dashboard-sort">
                  Ordenar por
                  <select
                    aria-label="Ordenar pessoas"
                    value={personSort}
                    onChange={(event) =>
                      setPersonSort(event.target.value as SortMode)
                    }
                  >
                    <option value="value-desc">Maior valor</option>
                    <option value="value-asc">Menor valor</option>
                    <option value="count">Compras</option>
                  </select>
                </label>
              </div>
              {people.length ? (
                <div className="dashboard-bars">
                  {people.map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      className={`dashboard-bar-row${filters.people.includes(row.id) ? " selected" : ""}`}
                      onClick={() => applyPerson(row.id)}
                      onDoubleClick={() => showForPerson(row.id, row.name)}
                      title="Clique para filtrar; duplo clique para ver compras"
                    >
                      <span className="dashboard-bar-label">{row.name}</span>
                      <span className="dashboard-bar-track">
                        <span
                          className="dashboard-bar-fill person"
                          style={{
                            width: `${barWidth(row.totalCents, maxPerson)}%`,
                          }}
                        />
                      </span>
                      <span className="dashboard-bar-value">
                        {money(row.totalCents)}
                        <small>
                          {row.purchaseCount} compras · média{" "}
                          {money(row.averageCents)} · {share(row.sharePercent)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="dashboard-no-data">Sem pessoas neste recorte.</p>
              )}
            </section>

            <section className="dashboard-panel dashboard-panel-wide">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Evolução mensal</h2>
                  <p>Compras ativas por competência, em ordem cronológica.</p>
                </div>
              </div>
              {analytics.months.length ? (
                <div
                  className="dashboard-month-chart"
                  role="img"
                  aria-label="Gastos ativos por mês"
                >
                  {analytics.months.map((month) => {
                    const peak = analytics.months.reduce(
                      (max, item) =>
                        item.totalCents > max ? item.totalCents : max,
                      0n,
                    );
                    return (
                      <button
                        key={month.reference}
                        type="button"
                        className="dashboard-month"
                        onClick={() => {
                          update("from", month.reference);
                          update("to", month.reference);
                        }}
                        title={`${formatReference(month.reference)}: ${money(month.totalCents)}`}
                      >
                        <span className="dashboard-month-value">
                          {money(month.totalCents)}
                        </span>
                        <span
                          className="dashboard-month-column"
                          style={{
                            height: peak
                              ? `${Math.max(3, Number((month.totalCents * 100n) / peak))}%`
                              : "3%",
                          }}
                        />
                        <span className="dashboard-month-label">
                          {formatReference(month.reference).split(" de ")[0]}
                          <small>{month.reference.slice(0, 4)}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="dashboard-no-data">
                  Selecione um intervalo de competências para comparar.
                </p>
              )}
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Distribuição por cartão</h2>
                  <p>Participação no gasto ativo.</p>
                </div>
              </div>
              <div className="dashboard-share-list">
                {cards
                  .filter((row) => row.totalCents > 0n)
                  .slice(0, 7)
                  .map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => applyCard(row.id)}
                    >
                      <span className="dashboard-share-dot" />
                      <span>{row.name}</span>
                      <strong>{share(row.sharePercent)}</strong>
                      <small>{money(row.totalCents)}</small>
                    </button>
                  ))}
              </div>
            </section>
            <section className="dashboard-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Distribuição por pessoa</h2>
                  <p>Participação no gasto ativo.</p>
                </div>
              </div>
              <div className="dashboard-share-list">
                {people
                  .filter((row) => row.totalCents > 0n)
                  .slice(0, 7)
                  .map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => applyPerson(row.id)}
                    >
                      <span className="dashboard-share-dot person" />
                      <span>{row.name}</span>
                      <strong>{share(row.sharePercent)}</strong>
                      <small>{money(row.totalCents)}</small>
                    </button>
                  ))}
              </div>
            </section>

            <section className="dashboard-panel dashboard-panel-wide">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Pessoa × cartão</h2>
                  <p>Valores em cada combinação; totais por linha e coluna.</p>
                </div>
              </div>
              {analytics.personCard.length ? (
                <div className="dashboard-matrix-wrap">
                  <table className="dashboard-matrix">
                    <thead>
                      <tr>
                        <th scope="col">Pessoa</th>
                        {analytics.byCard.map((row) => (
                          <th scope="col" key={row.id}>
                            {row.name}
                          </th>
                        ))}
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.personCard.map((row) => (
                        <tr key={row.person.id}>
                          <th scope="row">
                            <button
                              type="button"
                              onClick={() => applyPerson(row.person.id)}
                            >
                              {row.person.name}
                            </button>
                          </th>
                          {row.cards.map(({ card, totalCents }) => (
                            <td key={card.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  update("people", [row.person.id]);
                                  update("cards", [card.id]);
                                }}
                                aria-label={`${row.person.name}, ${card.name}: ${money(totalCents)}`}
                              >
                                {money(totalCents)}
                              </button>
                            </td>
                          ))}
                          <td className="dashboard-matrix-total">
                            {money(row.person.totalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total por cartão</th>
                        {analytics.byCard.map((row) => (
                          <td key={row.id} className="dashboard-matrix-total">
                            {money(row.totalCents)}
                          </td>
                        ))}
                        <td className="dashboard-matrix-total">
                          {money(analytics.totalByCard)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="dashboard-no-data">
                  Sem combinações neste recorte.
                </p>
              )}
            </section>
          </div>
          <section className="dashboard-panel dashboard-details">
            <div className="dashboard-section-heading">
              <div>
                <h2>Compras consideradas</h2>
                <p>
                  Cada valor do dashboard pode ser conferido pelos lançamentos
                  abaixo.
                </p>
              </div>
            </div>
            <div className="dashboard-purchase-list">
              {analytics.purchases.map((purchase) => (
                <article
                  key={purchase.id}
                  className={purchase.reimbursed ? "is-reimbursed" : ""}
                >
                  <div>
                    <strong>{purchase.description}</strong>
                    <small>
                      {purchase.personName} · {purchase.cardName} ·{" "}
                      {formatReference(purchase.reference)} · {typeOf(purchase)}
                      {purchase.installment
                        ? ` (${purchase.installment.current}/${purchase.installment.total})`
                        : ""}
                    </small>
                  </div>
                  <span>
                    {money(BigInt(purchase.amountCents))}
                    {purchase.reimbursed && (
                      <small>Estornada/reembolsada</small>
                    )}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {detail && (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <section
            className="dashboard-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-detail-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-detail-title">{detail.title}</h2>
                <p>{detail.purchases.length} compras neste recorte</p>
              </div>
              <button
                type="button"
                aria-label="Fechar detalhes"
                onClick={() => setDetail(null)}
              >
                Fechar
              </button>
            </div>
            <div className="dashboard-purchase-list">
              {detail.purchases.map((purchase) => (
                <article
                  key={purchase.id}
                  className={purchase.reimbursed ? "is-reimbursed" : ""}
                >
                  <div>
                    <strong>{purchase.description}</strong>
                    <small>
                      {purchase.personName} · {purchase.cardName} ·{" "}
                      {formatReference(purchase.reference)} · {typeOf(purchase)}
                    </small>
                  </div>
                  <span>{money(BigInt(purchase.amountCents))}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
