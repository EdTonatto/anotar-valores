import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, isAppData, type AppData } from "../src/domain/models";
import { loadData, saveData } from "../src/services/storage";
const fixture = (): AppData => ({
  schemaVersion: 1,
  people: [
    { id: "p1", name: "Ana" },
    { id: "p2", name: "Bia" },
  ],
  cards: [{ id: "c", name: "Cartão" }],
  invoices: [
    { id: "f1", personId: "p1", reference: "2026-10" },
    { id: "f2", personId: "p2", reference: "2026-10" },
  ],
  purchases: [
    {
      id: "b1",
      invoiceId: "f1",
      cardId: "c",
      description: "Compra",
      amountCents: 1,
      installment: { current: 2, total: 3 },
    },
    {
      id: "b2",
      invoiceId: "f2",
      cardId: "c",
      description: "Outra",
      amountCents: 12345,
      installment: null,
    },
  ],
});
test("primeiro acesso retorna base vazia válida", () => {
  assert.deepEqual(
    loadData({ getItem: () => null, setItem: () => {} }).data,
    createEmptyData(),
  );
});
test("persistência restaura pessoas, faturas, centavos e parcelas após nova leitura", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  saveData(storage, fixture());
  assert.deepEqual(loadData(storage).data, fixture());
});
test("cartão compartilhado e renomeado preserva associações", () => {
  const data = fixture();
  data.cards[0].name = "Outro nome";
  assert.equal(isAppData(data), true);
  assert.ok(data.purchases.every((p) => p.cardId === "c"));
});
test("corrupção e versão desconhecida bloqueiam escrita sem apagar original", () => {
  for (const raw of [
    "{",
    '{"schemaVersion":2}',
    JSON.stringify({
      ...fixture(),
      purchases: [{ ...fixture().purchases[0], cardId: "ausente" }],
    }),
  ]) {
    let writes = 0;
    const result = loadData({
      getItem: () => raw,
      setItem: () => {
        writes++;
      },
    });
    assert.equal(result.writable, false);
    assert.ok(result.message);
    assert.equal(writes, 0);
  }
});
test("rejeita centavos inválidos, parcelas e competências inconsistentes", () => {
  for (const amount of [0, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    const d = fixture();
    d.purchases[0].amountCents = amount;
    assert.equal(isAppData(d), false);
  }
  const d = fixture();
  d.purchases[0].installment = { current: 7, total: 3 };
  assert.equal(isAppData(d), false);
  d.purchases = [];
  d.invoices[0].reference = "2026-13";
  assert.equal(isAppData(d), false);
});
test("rejeita IDs duplicados e faturas duplicadas para pessoa/competência", () => {
  const d = fixture();
  d.cards.push({ ...d.cards[0] });
  assert.equal(isAppData(d), false);
  const other = fixture();
  other.invoices.push({ id: "f3", personId: "p1", reference: "2026-10" });
  assert.equal(isAppData(other), false);
});
test("quota e acesso bloqueado são tratados sem apagar dados", () => {
  assert.throws(
    () =>
      saveData(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        fixture(),
      ),
    /não foi aplicada/,
  );
  assert.equal(
    loadData({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    }).writable,
    false,
  );
});
test("gravação inválida não chama armazenamento", () => {
  let writes = 0;
  const d = fixture();
  d.purchases[0].amountCents = -1;
  assert.throws(() =>
    saveData(
      {
        getItem: () => null,
        setItem: () => {
          writes++;
        },
      },
      d,
    ),
  );
  assert.equal(writes, 0);
});
