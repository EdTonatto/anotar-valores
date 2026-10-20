import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, isAppData, type AppData } from "../src/domain/models";
import {
  canonicalData,
  exportInvoice,
  parseImport,
  planImport,
  whatsappReport,
} from "../src/domain/reports";
import { selectInvoiceSummary } from "../src/domain/totals";
import { loadData, saveData } from "../src/services/storage";
function fixture(): AppData {
  return {
    schemaVersion: 1,
    people: [
      { id: "p", name: "Ana" },
      { id: "q", name: "Bia" },
    ],
    cards: [
      { id: "c", name: "Roxo" },
      { id: "v", name: "Vazio" },
    ],
    invoices: [
      { id: "f", personId: "p", reference: "2026-10" },
      { id: "n", personId: "p", reference: "2026-11" },
      { id: "g", personId: "q", reference: "2026-10" },
    ],
    purchases: [
      {
        id: "a",
        invoiceId: "f",
        cardId: "c",
        description: "Compra um",
        amountCents: 13490,
        installment: { current: 2, total: 5 },
      },
      {
        id: "b",
        invoiceId: "f",
        cardId: "c",
        description: "Compra dois",
        amountCents: 12000,
        installment: null,
      },
      {
        id: "c",
        invoiceId: "n",
        cardId: "c",
        description: "Novembro",
        amountCents: 123,
        installment: null,
      },
      {
        id: "d",
        invoiceId: "g",
        cardId: "c",
        description: "Bia",
        amountCents: 456,
        installment: null,
      },
    ],
  };
}
test("WhatsApp inclui pessoa, competência, parcelas e totais; omite cartões vazios e outros históricos", () => {
  const data = fixture();
  const text = whatsappReport(data, "p", "2026-10");
  assert.ok(text.includes("*Ana*"));
  assert.ok(text.includes("2026-10"));
  assert.equal(text.split("*Roxo*").length, 2);
  assert.ok(text.includes("(2/5)"));
  assert.ok(text.includes("R$ 134,90"));
  assert.ok(text.includes("2 itens · *Subtotal: R$ 254,90*"));
  assert.ok(text.includes("*Total geral: R$ 254,90*"));
  assert.ok(!text.includes("Vazio"));
  assert.ok(!text.includes("Novembro"));
  assert.ok(!text.includes("Bia"));
  assert.equal(whatsappReport(data, "p", "2026-10"), text);
  assert.throws(() => whatsappReport(data, "missing", "2026-10"));
});

test("WhatsApp risca compras reembolsadas e exclui seu valor do subtotal", () => {
  const data = fixture();
  data.purchases[0].reimbursed = true;
  const text = whatsappReport(data, "p", "2026-10");
  assert.ok(text.includes("~• Compra um (2/5) — R$ 134,90 — reembolsada/estornada~"));
  assert.ok(text.includes("2 itens · *Subtotal: R$ 120,00*"));
  assert.ok(text.includes("*Total geral: R$ 120,00*"));
});
test("WhatsApp vazio mantém total zero e neutraliza marcadores em campos do usuário", () => {
  const data = fixture();
  data.people[0].name = "*Ana*";
  const text = whatsappReport(data, "p", "2026-12");
  assert.ok(text.startsWith("*Ana*"));
  assert.ok(text.includes("Nenhuma compra"));
  assert.ok(text.includes("R$ 0,00"));
});
test("exportar→parsear→importar restaura IDs, vínculos, parcelas e centavos", () => {
  const data = fixture();
  const exported = parseImport(exportInvoice(data, "p", "2026-10"));
  assert.equal(exported.people.length, 1);
  assert.equal(exported.invoices.length, 1);
  assert.equal(exported.purchases.length, 2);
  assert.deepEqual(exported.cards, data.cards);
  const result = planImport(createEmptyData(), exported, "merge", "local");
  assert.deepEqual(result.data, exported);
  assert.equal(
    selectInvoiceSummary(result.data, "p", "2026-10").totalCents,
    25490n,
  );
  assert.throws(() => exportInvoice(data, "p", "2026-12"));
});
test("backup completo preserva todo histórico e somente campos conhecidos são exportados", () => {
  const data = fixture();
  assert.deepEqual(parseImport(JSON.stringify(canonicalData(data))), data);
  const extra = {
    ...data,
    bankAccount: "secret",
    cards: data.cards.map((c) => ({ ...c, cardNumber: "secret" })),
  };
  assert.ok(!JSON.stringify(canonicalData(extra)).includes("secret"));
});
test("JSON inválido, versão desconhecida, IDs duplicados, referências e parcelas inválidas rejeitados sem mutação", () => {
  const base = fixture();
  const before = JSON.stringify(base);
  for (const raw of [
    "{",
    JSON.stringify({ ...base, schemaVersion: 2 }),
    JSON.stringify({ ...base, cards: [base.cards[0], base.cards[0]] }),
    JSON.stringify({
      ...base,
      purchases: [{ ...base.purchases[0], amountCents: -1 }],
    }),
    JSON.stringify({
      ...base,
      purchases: [
        { ...base.purchases[0], installment: { current: 7, total: 3 } },
      ],
    }),
    JSON.stringify({
      ...base,
      purchases: [{ ...base.purchases[0], cardId: "missing" }],
    }),
    JSON.stringify({
      ...base,
      invoices: [{ ...base.invoices[0], reference: "2026-13" }],
    }),
  ])
    assert.throws(() => parseImport(raw));
  assert.equal(JSON.stringify(base), before);
});
test("mesclar é idempotente e mantém compras atuais com IDs distintos", () => {
  const base = fixture();
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  let result = planImport(base, incoming, "merge", "local");
  assert.deepEqual(result.data, base);
  assert.equal(result.unchanged, 2);
  incoming.purchases.push({ ...incoming.purchases[0], id: "new" });
  result = planImport(base, incoming, "merge", "local");
  assert.equal(result.added, 1);
  assert.equal(result.data.purchases.length, 5);
  assert.equal(planImport(result.data, incoming, "merge", "local").added, 0);
});
test("substituir altera somente faturas do JSON e preserva outras pessoas e períodos", () => {
  const base = fixture();
  const before = JSON.stringify(base);
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  incoming.purchases = [{ ...incoming.purchases[0], amountCents: 1 }];
  assert.throws(() => planImport(base, incoming, "merge", "local"), /Conflito/);
  const result = planImport(base, incoming, "replace", "local");
  assert.equal(result.removed, 2);
  assert.equal(
    selectInvoiceSummary(result.data, "p", "2026-10").totalCents,
    1n,
  );
  assert.deepEqual(
    result.data.purchases.filter((p) => p.invoiceId !== "f"),
    base.purchases.filter((p) => p.invoiceId !== "f"),
  );
  assert.equal(JSON.stringify(base), before);
});
test("fatura com outro ID da mesma pessoa/competência é mapeada sem duplicação", () => {
  const base = fixture();
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  incoming.invoices[0].id = "different";
  incoming.purchases.forEach((p) => (p.invoiceId = "different"));
  const result = planImport(base, incoming, "merge", "local");
  assert.equal(result.data.invoices.length, 3);
  assert.deepEqual(result.data.purchases, base.purchases);
});
test("conflitos de nomes pelo mesmo ID seguem escolha explícita; nomes equivalentes com IDs diferentes bloqueados", () => {
  const base = fixture();
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  incoming.cards[0].name = "Novo";
  const local = planImport(base, incoming, "merge", "local");
  assert.equal(local.data.cards[0].name, "Roxo");
  assert.equal(local.conflicts.length, 1);
  assert.equal(
    planImport(base, incoming, "merge", "incoming").data.cards[0].name,
    "Novo",
  );
  incoming.cards[0] = { id: "different", name: "roxo" };
  assert.throws(() => planImport(base, incoming, "merge", "local"));
  const duplicate = fixture();
  duplicate.people.push({ id: "z", name: " ANA " });
  assert.throws(
    () => parseImport(JSON.stringify(duplicate)),
    /nomes equivalentes/,
  );
});
test("IDs de outras faturas nunca sobrescrevem histórico", () => {
  const base = fixture();
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  incoming.purchases[0].id = "c";
  assert.throws(
    () => planImport(base, incoming, "replace", "local"),
    /ID de compra/,
  );
  incoming.purchases[0].id = "a";
  incoming.invoices[0].personId = "q";
  incoming.people = [base.people[1]];
  assert.throws(
    () => planImport(base, incoming, "replace", "local"),
    /ID de fatura/,
  );
});
test("falha de gravação mantém snapshot; plano não muta dados e round-trip persiste", () => {
  const base = fixture();
  let raw: string | null = JSON.stringify(base);
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  const incoming = parseImport(exportInvoice(base, "p", "2026-10"));
  incoming.purchases = [];
  const plan = planImport(base, incoming, "replace", "local");
  const before = raw;
  assert.throws(() =>
    saveData(
      {
        ...storage,
        setItem: () => {
          throw new Error("Quota");
        },
      },
      plan.data,
    ),
  );
  assert.equal(raw, before);
  saveData(storage, plan.data);
  assert.deepEqual(loadData(storage).data, plan.data);
  assert.ok(isAppData(plan.data));
  assert.equal(base.purchases.length, 4);
});

test("WhatsApp conta cada lançamento por cartão e por fatura, com singular", () => {
  const data = fixture();
  assert.ok(
    whatsappReport(data, "p", "2026-11").includes(
      "1 item · *Subtotal: R$ 1,23*",
    ),
  );
  assert.ok(
    whatsappReport(data, "q", "2026-10").includes(
      "1 item · *Subtotal: R$ 4,56*",
    ),
  );
  data.purchases[1].cardId = "v";
  const text = whatsappReport(data, "p", "2026-10");
  assert.equal(text.match(/1 item ·/g)?.length, 2);
  assert.ok(!text.includes("2 itens"));
});
