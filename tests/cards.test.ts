import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, type AppData } from "../src/domain/models";
import {
  cardUsage,
  deleteCard,
  formatCents,
  saveCard,
  selectCardGroups,
} from "../src/domain/cards";
import { loadData, saveData } from "../src/services/storage";
function fixture(): AppData {
  return {
    schemaVersion: 1,
    people: [
      { id: "a", name: "Ana" },
      { id: "b", name: "Bia" },
    ],
    cards: [
      { id: "c", name: "Compartilhado" },
      { id: "v", name: "Vazio" },
    ],
    invoices: [
      { id: "o", personId: "a", reference: "2026-10" },
      { id: "n", personId: "a", reference: "2026-11" },
      { id: "b", personId: "b", reference: "2026-10" },
    ],
    purchases: [
      {
        id: "1",
        invoiceId: "o",
        cardId: "c",
        description: "Um",
        amountCents: 10,
        installment: null,
      },
      {
        id: "2",
        invoiceId: "o",
        cardId: "c",
        description: "Dois",
        amountCents: 20,
        installment: { current: 1, total: 2 },
      },
      {
        id: "3",
        invoiceId: "n",
        cardId: "c",
        description: "Três",
        amountCents: 99,
        installment: null,
      },
      {
        id: "4",
        invoiceId: "b",
        cardId: "c",
        description: "Quatro",
        amountCents: 123,
        installment: null,
      },
    ],
  };
}
test("cadastro normaliza espaços, mantém IDs únicos e rejeita nomes vazios/equivalentes", () => {
  const data = saveCard(createEmptyData(), "  Cartão   Azul ");
  assert.equal(data.cards[0].name, "Cartão Azul");
  assert.throws(() => saveCard(data, "CARTA\u0303O AZUL"), /Já existe/);
  assert.throws(() => saveCard(data, "  "), /Informe/);
  const next = saveCard(data, "Verde");
  assert.notEqual(next.cards[0].id, next.cards[1].id);
  assert.equal(data.cards.length, 1);
});
test("renomeação preserva todas compras, valores e vínculos de pessoas e meses", () => {
  const data = fixture();
  const renamed = saveCard(data, "Novo apelido", "c");
  assert.equal(renamed.cards[0].id, "c");
  assert.equal(renamed.cards[0].name, "Novo apelido");
  assert.deepEqual(renamed.purchases, data.purchases);
  assert.deepEqual(renamed.invoices, data.invoices);
  assert.equal(
    selectCardGroups(renamed, "a", "2026-10")[0].card.name,
    "Novo apelido",
  );
  assert.throws(() => saveCard(data, "Vazio", "c"), /Já existe/);
  assert.throws(() => saveCard(data, "Outro", "missing"), /não encontrado/);
});
test("exclusão bloqueia compras em qualquer mês ou pessoa; vazio pode sair sem cascata", () => {
  const data = fixture();
  assert.deepEqual(cardUsage(data, "c"), {
    purchases: 4,
    invoices: 3,
    people: 2,
  });
  assert.throws(() => deleteCard(data, "c"), /histórico/);
  assert.equal(data.cards.length, 2);
  const next = deleteCard(data, "v");
  assert.deepEqual(next.cards, [data.cards[0]]);
  assert.deepEqual(next.purchases, data.purchases);
  assert.throws(() => deleteCard(data, "missing"), /não encontrado/);
});
test("cadastro global permanece em qualquer contexto e subtotais não se misturam", () => {
  const data = fixture();
  const original = JSON.stringify(data);
  const oct = selectCardGroups(data, "a", "2026-10");
  assert.equal(oct[0].subtotalCents, 30n);
  assert.equal(oct[1].subtotalCents, 0n);
  assert.equal(selectCardGroups(data, "a", "2026-11")[0].subtotalCents, 99n);
  assert.equal(selectCardGroups(data, "b", "2026-10")[0].subtotalCents, 123n);
  assert.equal(selectCardGroups(data, "a", "2026-12").length, 2);
  assert.equal(selectCardGroups(data, "a", "2026-12")[0].subtotalCents, 0n);
  assert.equal(JSON.stringify(data), original);
});
test("cadastros e renomeações sobrevivem ao reload", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  const data = saveCard(fixture(), "Novo", "c");
  saveData(storage, data);
  assert.deepEqual(loadData(storage).data, data);
});
test("soma exata em centavos e formatação brasileira", () => {
  const data = fixture();
  data.purchases[0].amountCents = Number.MAX_SAFE_INTEGER;
  data.purchases[1].amountCents = Number.MAX_SAFE_INTEGER;
  assert.equal(
    selectCardGroups(data, "a", "2026-10")[0].subtotalCents,
    18014398509481982n,
  );
  assert.equal(formatCents(30n), "R$ 0,30");
  assert.equal(formatCents(123456n), "R$ 1.234,56");
});
