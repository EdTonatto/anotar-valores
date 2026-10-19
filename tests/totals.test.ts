import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, isAppData, type AppData } from "../src/domain/models";
import { selectInvoiceSummary, formatCents } from "../src/domain/totals";
import {
  savePurchase,
  deletePurchase,
  parseAmount,
  type PurchaseDraft,
} from "../src/domain/purchases";
import { saveCard } from "../src/domain/cards";
const fixture = (): AppData => ({
  ...createEmptyData(),
  people: [
    { id: "p", name: "Pessoa" },
    { id: "q", name: "Outra" },
  ],
  cards: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "Vazio" },
  ],
});
const draft = (cardId: string, amount: string): PurchaseDraft => ({
  description: "Compra",
  cardId,
  amount,
  parcelled: false,
  current: "",
  total: "",
});
test("exemplo de aceite: 134,90 + 120,00 = 254,90 sem dupla contagem", () => {
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "134,90"));
  data = savePurchase(data, "p", "2026-10", draft("b", "120,00"));
  const summary = selectInvoiceSummary(data, "p", "2026-10");
  assert.deepEqual(
    summary.groups.map((g) => g.subtotalCents),
    [13490n, 12000n, 0n],
  );
  assert.equal(summary.purchaseCount, 2);
  assert.equal(summary.totalCents, 25490n);
  assert.equal(formatCents(summary.totalCents), "R$ 254,90");
});
test("precisão: dez e vinte centavos resultam em trinta, sem arredondar entradas", () => {
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "0,10"));
  data = savePurchase(data, "p", "2026-10", draft("a", "0,20"));
  assert.equal(
    formatCents(selectInvoiceSummary(data, "p", "2026-10").totalCents),
    "R$ 0,30",
  );
  assert.throws(() => parseAmount("0,105"));
});
test("sem compras ou cartões totaliza zero e filtra pessoa e mês", () => {
  assert.equal(
    selectInvoiceSummary(createEmptyData(), "", "2026-10").totalCents,
    0n,
  );
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "1,00"));
  data = savePurchase(data, "q", "2026-10", draft("a", "2,00"));
  data = savePurchase(data, "p", "2026-11", draft("a", "3,00"));
  assert.equal(selectInvoiceSummary(data, "p", "2026-10").totalCents, 100n);
  assert.equal(selectInvoiceSummary(data, "q", "2026-10").totalCents, 200n);
  assert.equal(selectInvoiceSummary(data, "p", "2026-11").totalCents, 300n);
  assert.equal(
    formatCents(selectInvoiceSummary(data, "p", "2026-12").totalCents),
    "R$ 0,00",
  );
});
test("editar, mover de cartão, renomear e excluir recalcula uma única fonte", () => {
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "10,00"));
  const id = data.purchases[0].id;
  data = savePurchase(
    data,
    "p",
    "2026-10",
    { ...draft("b", "20,00"), parcelled: true, current: "2", total: "5" },
    id,
  );
  data = saveCard(data, "Renomeado", "b");
  const summary = selectInvoiceSummary(data, "p", "2026-10");
  assert.equal(summary.groups[0].subtotalCents, 0n);
  assert.equal(summary.groups[1].subtotalCents, 2000n);
  assert.equal(summary.groups[1].card.name, "Renomeado");
  assert.equal(summary.totalCents, 2000n);
  data = deletePurchase(data, "p", "2026-10", id);
  assert.equal(selectInvoiceSummary(data, "p", "2026-10").totalCents, 0n);
});
test("JSON preserva centavos e substituição do snapshot recalcula sem cache ou mutação", () => {
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "1,23"));
  const before = JSON.stringify(data);
  const restored: unknown = JSON.parse(before);
  assert.ok(isAppData(restored));
  assert.equal(selectInvoiceSummary(restored, "p", "2026-10").totalCents, 123n);
  assert.equal(JSON.stringify(data), before);
  assert.equal("totalCents" in restored, false);
  assert.equal("subtotalCents" in restored.purchases[0], false);
  data = savePurchase(restored, "p", "2026-10", draft("a", "4,56"));
  assert.equal(selectInvoiceSummary(data, "p", "2026-10").totalCents, 579n);
  assert.equal(selectInvoiceSummary(restored, "p", "2026-10").totalCents, 123n);
});
test("soma além do inteiro seguro mantém precisão e não altera dados", () => {
  let data = savePurchase(
    fixture(),
    "p",
    "2026-10",
    draft("a", "90071992547409,91"),
  );
  data = savePurchase(data, "p", "2026-10", draft("b", "90071992547409,91"));
  assert.equal(
    selectInvoiceSummary(data, "p", "2026-10").totalCents,
    18014398509481982n,
  );
  assert.equal(
    formatCents(selectInvoiceSummary(data, "p", "2026-10").totalCents),
    "R$ 180.143.985.094.819,82",
  );
});

test("fatura do cartão reúne pessoas, isola mês e reflete edição e exclusão", async () => {
  const { selectCardInvoiceSummary } = await import("../src/domain/totals");
  let data = savePurchase(fixture(), "p", "2026-10", draft("a", "10,00"));
  data = savePurchase(data, "q", "2026-10", draft("a", "20,00"));
  data = savePurchase(data, "p", "2026-10", draft("b", "40,00"));
  data = savePurchase(data, "q", "2026-11", draft("a", "80,00"));
  const summary = selectCardInvoiceSummary(data, "a", "2026-10");
  assert.equal(summary.totalCents, 3000n);
  assert.equal(summary.purchaseCount, 2);
  assert.deepEqual(
    summary.groups.map((g) => [g.person.id, g.subtotalCents]),
    [
      ["p", 1000n],
      ["q", 2000n],
    ],
  );
  const id = summary.purchases[0].purchase.id;
  data = savePurchase(data, "p", "2026-10", draft("a", "15,00"), id);
  assert.equal(
    selectCardInvoiceSummary(data, "a", "2026-10").totalCents,
    3500n,
  );
  assert.equal(selectInvoiceSummary(data, "p", "2026-10").totalCents, 5500n);
  data = deletePurchase(data, "p", "2026-10", id);
  assert.equal(
    selectCardInvoiceSummary(data, "a", "2026-10").totalCents,
    2000n,
  );
  assert.equal(selectInvoiceSummary(data, "p", "2026-10").totalCents, 4000n);
  assert.equal(isAppData(data), true);
  assert.equal(selectCardInvoiceSummary(data, "c", "2026-10").totalCents, 0n);
});
