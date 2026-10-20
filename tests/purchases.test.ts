import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, type AppData } from "../src/domain/models";
import {
  amountInput,
  deletePurchase,
  parseAmount,
  PurchaseError,
  savePurchase,
  type PurchaseDraft,
} from "../src/domain/purchases";
import { selectCardGroups } from "../src/domain/cards";
import { loadData, saveData } from "../src/services/storage";
const draft: PurchaseDraft = {
  description: "  Compra   teste ",
  cardId: "c",
  amount: "0,01",
  parcelled: false,
  current: "",
  total: "",
};
const fixture = (): AppData => ({
  ...createEmptyData(),
  people: [
    { id: "a", name: "Ana" },
    { id: "b", name: "Bia" },
  ],
  cards: [
    { id: "c", name: "Um" },
    { id: "d", name: "Dois" },
  ],
});
test("valores em reais são convertidos exatamente e formatos ambíguos são rejeitados", () => {
  for (const [value, cents] of [
    ["0,01", 1],
    ["0,1", 10],
    ["1234,56", 123456],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["10", 1000],
    ["90071992547409,91", Number.MAX_SAFE_INTEGER],
  ] as const) {
    assert.equal(parseAmount(value), cents);
    assert.equal(parseAmount(amountInput(cents)), cents);
  }
  for (const value of [
    "",
    "0",
    "0,00",
    "-1",
    "1.23",
    "1,234",
    "1e3",
    "R$ 1,00",
    "1,000.00",
    "NaN",
    "90071992547409,92",
  ])
    assert.throws(() => parseAmount(value), PurchaseError);
});
test("cadastro cria fatura e compra atomicamente, normaliza descrição e permite repetidas", () => {
  const source = fixture();
  const one = savePurchase(source, "a", "2026-10", draft);
  const two = savePurchase(one, "a", "2026-10", draft);
  assert.equal(source.invoices.length, 0);
  assert.equal(two.invoices.length, 1);
  assert.equal(two.purchases.length, 2);
  assert.notEqual(two.purchases[0].id, two.purchases[1].id);
  assert.equal(two.purchases[0].description, "Compra teste");
  assert.equal(two.purchases[0].amountCents, 1);
  assert.equal(two.purchases[0].installment, null);
});
test("parcelamento usa valor mensal e cria futuras; intervalos inválidos não entram", () => {
  const data = savePurchase(fixture(), "a", "2026-10", {
    ...draft,
    amount: "100,00",
    parcelled: true,
    current: "2",
    total: "5",
  });
  assert.deepEqual(data.purchases[0].installment, { current: 2, total: 5 });
  assert.equal(selectCardGroups(data, "a", "2026-10")[0].subtotalCents, 10000n);
  assert.equal(data.invoices.length, 4);
  for (const [current, total] of [
    ["7", "3"],
    ["0", "3"],
    ["1.5", "3"],
    ["1", ""],
    ["1", "1e2"],
    ["1", "9007199254740992"],
  ])
    assert.throws(
      () =>
        savePurchase(fixture(), "a", "2026-10", {
          ...draft,
          parcelled: true,
          current,
          total,
        }),
      PurchaseError,
    );
});
test("edição mantém ID e competência, permite trocar cartão e remover parcelamento", () => {
  const source = savePurchase(fixture(), "a", "2026-10", {
    ...draft,
    parcelled: true,
    current: "1",
    total: "3",
  });
  const id = source.purchases[0].id;
  const edited = savePurchase(
    source,
    "a",
    "2026-10",
    { ...draft, description: "Corrigida", cardId: "d", amount: "12,34" },
    id,
  );
  assert.equal(edited.purchases.length, 3);
  assert.equal(edited.purchases[0].id, id);
  assert.equal(edited.purchases[0].invoiceId, source.purchases[0].invoiceId);
  assert.equal(edited.purchases[0].installment, null);
  assert.equal(selectCardGroups(edited, "a", "2026-10")[0].subtotalCents, 0n);
  assert.equal(
    selectCardGroups(edited, "a", "2026-10")[1].subtotalCents,
    1234n,
  );
  assert.equal(source.purchases[0].cardId, "c");
  assert.throws(
    () => savePurchase(source, "b", "2026-10", draft, id),
    /não encontrada/,
  );
  assert.throws(
    () => savePurchase(source, "a", "2026-11", draft, id),
    /não encontrada/,
  );
});
test("exclusão remove somente a compra selecionada e não atravessa pessoa/mês", () => {
  let data = savePurchase(fixture(), "a", "2026-10", draft);
  const id = data.purchases[0].id;
  data = savePurchase(data, "a", "2026-11", draft);
  data = savePurchase(data, "b", "2026-10", draft);
  assert.throws(
    () => deletePurchase(data, "b", "2026-10", id),
    /não encontrada/,
  );
  const next = deletePurchase(data, "a", "2026-10", id);
  assert.deepEqual(next.purchases, data.purchases.slice(1));
  assert.equal(next.invoices.length, 3);
  assert.equal(selectCardGroups(next, "a", "2026-10")[0].subtotalCents, 0n);
  assert.equal(data.purchases.length, 3);
});
test("dados inválidos não criam nem alteram registros", () => {
  const data = fixture();
  const before = JSON.stringify(data);
  for (const invalid of [
    { ...draft, description: " " },
    { ...draft, cardId: "missing" },
    { ...draft, amount: "0" },
  ])
    assert.throws(() => savePurchase(data, "a", "2026-10", invalid));
  assert.throws(() => savePurchase(data, "missing", "2026-10", draft));
  assert.throws(() => savePurchase(data, "a", "2026-13", draft));
  assert.equal(JSON.stringify(data), before);
});
test("reload preserva cadastro, edição e exclusão; quota mantém snapshot anterior", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  let data = savePurchase(fixture(), "a", "2026-10", draft);
  saveData(storage, data);
  assert.deepEqual(loadData(storage).data, data);
  const id = data.purchases[0].id;
  data = savePurchase(data, "a", "2026-10", { ...draft, amount: "55,55" }, id);
  saveData(storage, data);
  assert.equal(loadData(storage).data.purchases[0].amountCents, 5555);
  const before = raw;
  assert.throws(() =>
    saveData(
      {
        ...storage,
        setItem: () => {
          throw new Error("Quota");
        },
      },
      deletePurchase(data, "a", "2026-10", id),
    ),
  );
  assert.equal(raw, before);
  data = deletePurchase(data, "a", "2026-10", id);
  saveData(storage, data);
  assert.equal(loadData(storage).data.purchases.length, 0);
});

test("registro mantém data original, atualiza fatura e cartão inclusive após exclusão", () => {
  const source = savePurchase(fixture(), "a", "2026-10", draft);
  const original = "2020-01-01T12:00:00.000Z";
  source.purchases[0].createdAt = original;
  const id = source.purchases[0].id;
  const edited = savePurchase(
    source,
    "a",
    "2026-10",
    { ...draft, cardId: "d" },
    id,
  );
  assert.equal(edited.purchases[0].createdAt, original);
  assert.equal(edited.invoices[0].updatedAt, edited.purchases[0].updatedAt);
  assert.equal(
    edited.invoices[0].cardUpdatedAt?.c,
    edited.purchases[0].updatedAt,
  );
  assert.equal(
    edited.invoices[0].cardUpdatedAt?.d,
    edited.purchases[0].updatedAt,
  );
  const deleted = deletePurchase(edited, "a", "2026-10", id);
  assert.ok(deleted.invoices[0].cardUpdatedAt?.d);
  assert.equal(deleted.purchases.length, 0);
});

test("ambas as faturas ordenam pela criação, mantêm antigos e não alteram os dados", async () => {
  const { selectInvoiceSummary, selectCardInvoiceSummary } =
    await import("../src/domain/totals");
  const { isAppData } = await import("../src/domain/models");
  let data = savePurchase(fixture(), "a", "2026-10", draft);
  data = savePurchase(data, "a", "2026-10", draft);
  data = savePurchase(data, "a", "2026-10", draft);
  delete data.purchases[0].createdAt;
  data.purchases[1].createdAt = "2026-10-19T12:00:00.000Z";
  data.purchases[2].createdAt = "2026-10-18T12:00:00.000Z";
  const expected = [
    data.purchases[1].id,
    data.purchases[2].id,
    data.purchases[0].id,
  ];
  const before = JSON.stringify(data);
  assert.deepEqual(
    selectInvoiceSummary(data, "a", "2026-10").groups[0].purchases.map(
      (p) => p.id,
    ),
    expected,
  );
  assert.deepEqual(
    selectCardInvoiceSummary(data, "c", "2026-10").purchases.map(
      (r) => r.purchase.id,
    ),
    expected,
  );
  assert.equal(JSON.stringify(data), before);
  assert.ok(isAppData(data));
  data.purchases[0].createdAt = "invalid";
  assert.equal(isAppData(data), false);
});

test("trocar comprador reutiliza fatura de destino e rejeita pessoa inexistente sem mutar", () => {
  let source = savePurchase(fixture(), "a", "2026-10", draft);
  source = savePurchase(source, "b", "2026-10", draft);
  const original = source.purchases[0];
  const moved = savePurchase(
    source,
    "a",
    "2026-10",
    { ...draft, cardId: "d" },
    original.id,
    "b",
  );
  assert.equal(moved.invoices.length, 2);
  assert.equal(moved.purchases.length, 2);
  assert.equal(moved.purchases[0].invoiceId, source.purchases[1].invoiceId);
  assert.equal(selectCardGroups(moved, "a", "2026-10")[0].subtotalCents, 0n);
  assert.equal(selectCardGroups(moved, "b", "2026-10")[1].subtotalCents, 1n);
  assert.throws(
    () => savePurchase(source, "a", "2026-10", draft, original.id, "missing"),
    PurchaseError,
  );
  assert.equal(source.purchases[0], original);
});
