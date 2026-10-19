import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData } from "../src/domain/models";
import {
  currentReference,
  ensureInvoice,
  formatReference,
  isReference,
  savePerson,
  selectInvoice,
} from "../src/domain/peopleAndInvoices";
import { loadData, saveData } from "../src/services/storage";
test("cadastro normaliza espaços e rejeita nomes equivalentes sem mutação", () => {
  const result = savePerson(createEmptyData(), "  João   Silva  ");
  assert.equal(result.data.people[0].name, "João Silva");
  assert.throws(() => savePerson(result.data, "JOÃO SILVA"), /Já existe/);
  assert.throws(() => savePerson(result.data, "Joa\u0303o Silva"), /Já existe/);
  assert.throws(() => savePerson(result.data, "   "), /Informe/);
  assert.equal(result.data.people.length, 1);
});
test("renomear conserva IDs, faturas e compras; conflito rejeitado", () => {
  let { data, personId } = savePerson(createEmptyData(), "Ana");
  data = savePerson(data, "Bia").data;
  data = ensureInvoice(data, personId, "2026-10");
  data.cards = [{ id: "c", name: "Cartão" }];
  data.purchases = [
    {
      id: "b",
      invoiceId: data.invoices[0].id,
      cardId: "c",
      description: "Compra",
      amountCents: 100,
      installment: null,
    },
  ];
  const renamed = savePerson(data, "Ana Maria", personId);
  assert.equal(renamed.personId, personId);
  assert.deepEqual(renamed.data.invoices, data.invoices);
  assert.deepEqual(renamed.data.purchases, data.purchases);
  assert.throws(() => savePerson(data, "bia", personId), /Já existe/);
  assert.throws(() => savePerson(data, "Outro", "missing"), /não encontrada/);
});
test("competência é válida e mês inicial usa data local", () => {
  assert.equal(currentReference(new Date(2026, 9, 19)), "2026-10");
  for (const invalid of [
    "",
    "2026-00",
    "2026-13",
    "26-10",
    "0000-01",
    "2026-1",
  ])
    assert.equal(isReference(invalid), false);
  assert.equal(isReference("2026-11"), true);
  assert.equal(formatReference("2026-10"), "outubro de 2026");
});
test("outubro, novembro e outra pessoa ficam isolados e sobrevivem à recarga", () => {
  const first = savePerson(createEmptyData(), "Ana");
  const second = savePerson(first.data, "Bia");
  let data = ensureInvoice(second.data, first.personId, "2026-10");
  data = ensureInvoice(data, first.personId, "2026-11");
  data = ensureInvoice(data, second.personId, "2026-10");
  data.cards = [{ id: "c", name: "Compartilhado" }];
  data.purchases = data.invoices.map((f, i) => ({
    id: `b${i}`,
    invoiceId: f.id,
    cardId: "c",
    description: `Compra ${i}`,
    amountCents: 100 + i,
    installment: null,
  }));
  const original = JSON.stringify(data);
  assert.equal(
    selectInvoice(data, first.personId, "2026-10").purchases[0].id,
    "b0",
  );
  assert.equal(
    selectInvoice(data, first.personId, "2026-11").purchases[0].id,
    "b1",
  );
  assert.equal(
    selectInvoice(data, second.personId, "2026-10").purchases[0].id,
    "b2",
  );
  assert.deepEqual(
    selectInvoice(data, first.personId, "2026-12").purchases,
    [],
  );
  assert.equal(JSON.stringify(data), original);
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  saveData(storage, data);
  assert.deepEqual(loadData(storage).data, data);
});
test("criar competência é idempotente e preserva histórico existente", () => {
  const { data, personId } = savePerson(createEmptyData(), "Ana");
  const october = ensureInvoice(data, personId, "2026-10");
  assert.equal(ensureInvoice(october, personId, "2026-10"), october);
  const november = ensureInvoice(october, personId, "2026-11");
  assert.equal(november.invoices.length, 2);
  assert.deepEqual(november.invoices[0], october.invoices[0]);
  assert.equal(data.invoices.length, 0);
  assert.throws(() => ensureInvoice(october, personId, "2026-13"), /válidos/);
  assert.throws(() => ensureInvoice(october, "missing", "2026-10"), /válida/);
});
