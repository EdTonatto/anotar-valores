import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, type AppData } from "../src/domain/models";
import {
  emptyDashboardFilters,
  getDashboardAnalytics,
  getDashboardPurchases,
} from "../src/domain/analytics";
const fixture = (): AppData => ({
  ...createEmptyData(),
  people: [
    { id: "p1", name: "Ana" },
    { id: "p2", name: "Bia" },
  ],
  cards: [
    { id: "c1", name: "Nubank" },
    { id: "c2", name: "Itaú" },
  ],
  invoices: [
    { id: "i1", personId: "p1", reference: "2026-10" },
    { id: "i2", personId: "p2", reference: "2026-10" },
    { id: "i3", personId: "p1", reference: "2026-12" },
  ],
  purchases: [
    {
      id: "a",
      invoiceId: "i1",
      cardId: "c1",
      description: "Café",
      amountCents: 1099,
      installment: null,
    },
    {
      id: "b",
      invoiceId: "i1",
      cardId: "c2",
      description: "Notebook",
      amountCents: 10000,
      installment: { current: 2, total: 4 },
    },
    {
      id: "c",
      invoiceId: "i2",
      cardId: "c1",
      description: "Estorno",
      amountCents: 5000,
      installment: null,
      reimbursed: true,
    },
    {
      id: "d",
      invoiceId: "i3",
      cardId: "c1",
      description: "Mercado",
      amountCents: 2500,
      installment: null,
    },
  ],
});
test("summary uses integer cents and excludes reversed purchases by default", () => {
  const data = fixture();
  const result = getDashboardAnalytics(data, emptyDashboardFilters());
  assert.equal(result.totalCents, 13599n);
  assert.equal(result.purchaseCount, 3);
  assert.equal(result.peopleCount, 1);
  assert.equal(result.leadingPerson?.id, "p1");
  assert.equal(result.leadingCard?.id, "c2");
  assert.equal(result.largestPurchase?.id, "b");
  assert.equal(data.purchases.length, 4);
});
test("combined period, person, card, type and amount filters return source records", () => {
  const filters = {
    ...emptyDashboardFilters(),
    from: "2026-10",
    to: "2026-10",
    people: ["p1"],
    cards: ["c2"],
    purchaseType: "installment" as const,
    minCents: 5000,
    maxCents: 10000,
  };
  const found = getDashboardPurchases(fixture(), filters);
  assert.deepEqual(
    found.map((p) => p.id),
    ["b"],
  );
  assert.equal(found[0].reference, "2026-10");
});
test("reversed status exposes history without adding it to active totals", () => {
  const filters = { ...emptyDashboardFilters(), status: "all" as const };
  const result = getDashboardAnalytics(fixture(), filters);
  assert.equal(result.purchases.length, 4);
  assert.equal(result.totalCents, 13599n);
  const reversed = getDashboardAnalytics(fixture(), {
    ...filters,
    status: "reimbursed",
  });
  assert.equal(reversed.purchases.length, 1);
  assert.equal(reversed.totalCents, 0n);
  assert.equal(reversed.purchaseCount, 0);
});
test("monthly series fills empty competencies and person-card matrix matches totals", () => {
  const result = getDashboardAnalytics(fixture(), {
    ...emptyDashboardFilters(),
    from: "2026-10",
    to: "2026-12",
  });
  assert.deepEqual(
    result.months.map((row) => row.reference),
    ["2026-10", "2026-11", "2026-12"],
  );
  assert.deepEqual(
    result.months.map((row) => row.totalCents),
    [11099n, 0n, 2500n],
  );
  assert.equal(
    result.personCard
      .find((row) => row.person.id === "p1")
      ?.cards.find((row) => row.card.id === "c2")?.totalCents,
    10000n,
  );
});
test("default monthly chart shows the last six months rather than one month per existing invoice", () => {
  const result = getDashboardAnalytics(fixture(), emptyDashboardFilters());
  assert.deepEqual(
    result.months.map((row) => row.reference),
    ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"],
  );
  assert.deepEqual(
    result.months.map((row) => row.totalCents),
    [0n, 0n, 0n, 11099n, 0n, 2500n],
  );
});
