import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, type AppData } from "../src/domain/models";
import { savePurchase, type PurchaseDraft } from "../src/domain/purchases";
import { getDashboardAnalytics, getDashboardPurchases, emptyDashboardFilters } from "../src/domain/analytics";

const fixture = (): AppData => ({
  ...createEmptyData(),
  people: [{ id: "p1", name: "Ana" }, { id: "p2", name: "João" }],
  cards: [{ id: "c1", name: "Nubank" }, { id: "c2", name: "Itaú" }],
});
const draft = (cardId: string, amount: string, parcelled = false): PurchaseDraft => ({
  description: "Compra",
  cardId,
  amount,
  parcelled,
  current: parcelled ? "1" : "",
  total: parcelled ? "3" : "",
});

test("dashboard agrega por pessoa/cartão e mantém precisão em centavos", () => {
  let data = savePurchase(fixture(), "p1", "2026-01", draft("c1", "10,10"));
  data = savePurchase(data, "p1", "2026-01", draft("c2", "2,00"));
  data = savePurchase(data, "p2", "2026-02", draft("c1", "3,25", true));
  const filters = { ...emptyDashboardFilters(), from: "2026-01", to: "2026-02" };
  const result = getDashboardAnalytics(data, filters);
  assert.equal(result.totalCents, 1535n);
  assert.equal(result.purchaseCount, 4);
  assert.equal(result.activeCount, 4);
  assert.equal(result.leadingPerson?.id, "p1");
  assert.equal(result.leadingCard?.id, "c1");
  assert.equal(result.personCard.find((row) => row.person.id === "p1")?.cards.find((item) => item.card.id === "c1")?.totalCents, 1010n);
  assert.deepEqual(result.months.map((month) => [month.reference, month.totalCents]), [["2026-01", 1210n], ["2026-02", 325n]]);
});

test("filtros combinados por intervalo, pessoa, cartão e tipo", () => {
  let data = savePurchase(fixture(), "p1", "2026-01", draft("c1", "10,00"));
  data = savePurchase(data, "p2", "2026-02", draft("c1", "20,00"));
  data = savePurchase(data, "p1", "2026-03", draft("c2", "30,00", true));
  const filters = { ...emptyDashboardFilters(), from: "2026-02", to: "2026-03", people: ["p1"], cards: ["c2"], purchaseType: "installment" as const };
  const rows = getDashboardPurchases(data, filters);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.personId === "p1" && row.cardId === "c2" && row.installment));
  assert.deepEqual(getDashboardAnalytics(data, filters).months.map((month) => month.reference), ["2026-02", "2026-03"]);
});

test("reembolsadas saem do padrão e podem ser incluídas com status explícito", () => {
  let data = savePurchase(fixture(), "p1", "2026-01", draft("c1", "10,00"));
  data = savePurchase(data, "p1", "2026-01", draft("c1", "5,00"));
  data.purchases[0].reimbursed = true;
  const filters = { ...emptyDashboardFilters(), from: "2026-01", to: "2026-01" };
  const active = getDashboardAnalytics(data, filters);
  assert.equal(active.totalCents, 500n);
  assert.equal(active.purchaseCount, 1);
  const all = getDashboardAnalytics(data, { ...filters, status: "all" });
  assert.equal(all.totalCents, 500n);
  assert.equal(all.purchaseCount, 2);
  const refunded = getDashboardAnalytics(data, { ...filters, status: "reimbursed" });
  assert.equal(refunded.totalCents, 0n);
  assert.equal(refunded.purchaseCount, 1);
  assert.equal(refunded.largestPurchase, null);
});

test("competências intermediárias vazias são preenchidas com zero", () => {
  const data = savePurchase(fixture(), "p1", "2026-01", draft("c1", "1,00"));
  const result = getDashboardAnalytics(data, { ...emptyDashboardFilters(), from: "2026-01", to: "2026-03" });
  assert.deepEqual(result.months.map((month) => [month.reference, month.totalCents]), [["2026-01", 100n], ["2026-02", 0n], ["2026-03", 0n]]);
});
