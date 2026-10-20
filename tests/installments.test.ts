import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyData, isAppData, type AppData } from "../src/domain/models";
import {
  savePurchase,
  deletePurchase,
  type PurchaseDraft,
} from "../src/domain/purchases";
import {
  canonicalData,
  parseImport,
  planImport,
  whatsappReport,
} from "../src/domain/reports";
import {
  selectInvoiceSummary,
  selectCardInvoiceSummary,
} from "../src/domain/totals";
import { saveData, loadData } from "../src/services/storage";
const fixture = (): AppData => ({
  ...createEmptyData(),
  people: [
    { id: "a", name: "Ana" },
    { id: "b", name: "Bia" },
  ],
  cards: [
    { id: "c", name: "Roxo" },
    { id: "d", name: "Verde" },
  ],
});
const draft: PurchaseDraft = {
  description: "Notebook",
  cardId: "c",
  amount: "250,00",
  parcelled: true,
  current: "2",
  total: "5",
};
const series = () => savePurchase(fixture(), "a", "2026-10", draft);
test("gera somente parcelas restantes com IDs distintos, séries distintas e virada de ano", () => {
  const data = series();
  assert.deepEqual(
    data.invoices.map((f) => f.reference),
    ["2026-10", "2026-11", "2026-12", "2027-01"],
  );
  assert.deepEqual(
    data.purchases.map((p) => p.installment?.current),
    [2, 3, 4, 5],
  );
  assert.equal(new Set(data.purchases.map((p) => p.id)).size, 4);
  assert.equal(
    new Set(data.purchases.map((p) => p.installmentSeriesId)).size,
    1,
  );
  for (const f of data.invoices) {
    assert.equal(
      selectInvoiceSummary(data, "a", f.reference).totalCents,
      25000n,
    );
    assert.equal(
      selectCardInvoiceSummary(data, "c", f.reference).totalCents,
      25000n,
    );
    assert.match(
      whatsappReport(data, "a", f.reference),
      new RegExp(
        `\\(${data.purchases.find((p) => p.invoiceId === f.id)!.installment!.current}/5\\)`,
      ),
    );
  }
  const two = savePurchase(data, "a", "2026-10", draft);
  assert.notEqual(
    two.purchases[0].installmentSeriesId,
    two.purchases[4].installmentSeriesId,
  );
  for (const total of [2, 5, 12]) {
    const next = savePurchase(fixture(), "a", "2026-10", {
      ...draft,
      current: "1",
      total: String(total),
    });
    assert.equal(next.purchases.length, total);
    assert.ok(isAppData(next));
  }
});
test("edição isolada, próximas e toda série respeitam comprador, cartão e total", () => {
  const data = series(),
    id = data.purchases[1].id;
  const changed = {
    ...draft,
    current: "3",
    description: "Editada",
    cardId: "d",
  };
  const single = savePurchase(data, "a", "2026-11", changed, id, "b");
  assert.equal(
    single.purchases.filter((p) => p.description === "Editada").length,
    1,
  );
  const following = savePurchase(
    data,
    "a",
    "2026-11",
    changed,
    id,
    "b",
    "following",
  );
  assert.equal(
    following.purchases.filter((p) => p.description === "Editada").length,
    3,
  );
  assert.equal(
    selectInvoiceSummary(following, "b", "2026-12").totalCents,
    25000n,
  );
  const all = savePurchase(data, "a", "2026-11", changed, id, "b", "all");
  assert.ok(
    all.purchases.every((p) => p.description === "Editada" && p.cardId === "d"),
  );
  const shorter = savePurchase(
    data,
    "a",
    "2026-11",
    { ...changed, total: "3" },
    id,
    "a",
    "following",
  );
  assert.deepEqual(
    shorter.purchases.map((p) => p.installment?.current),
    [2, 3],
  );
  const longer = savePurchase(
    shorter,
    "a",
    "2026-11",
    { ...changed, total: "7" },
    id,
    "a",
    "following",
  );
  assert.equal(longer.purchases.length, 6);
  assert.ok(isAppData(longer));
  assert.equal(data.purchases.length, 4);
  assert.throws(() =>
    savePurchase(data, "a", "2026-11", { ...changed, total: "3" }, id),
  );
});
test("exclusão isolada e futuras não alcançam outras séries; legado não gera parcelas", () => {
  const data = series(),
    id = data.purchases[1].id;
  assert.equal(deletePurchase(data, "a", "2026-11", id).purchases.length, 3);
  const two = savePurchase(data, "a", "2026-10", draft);
  assert.equal(
    deletePurchase(two, "a", "2026-11", id, "following").purchases.length,
    5,
  );
  const legacy = series();
  legacy.purchases = legacy.purchases.slice(0, 1);
  delete legacy.purchases[0].installmentSeriesId;
  const edited = savePurchase(
    legacy,
    "a",
    "2026-10",
    draft,
    legacy.purchases[0].id,
  );
  assert.equal(edited.purchases.length, 1);
  assert.ok(isAppData(edited));
});
test("JSON e reload preservam séries; duplicata lógica e parcelas inválidas são rejeitadas", () => {
  const data = series();
  const incoming = parseImport(JSON.stringify(canonicalData(data)));
  assert.deepEqual(incoming, data);
  const once = planImport(fixture(), incoming, "merge", "local").data;
  assert.deepEqual(planImport(once, incoming, "merge", "local").data, once);
  const duplicate = structuredClone(data);
  duplicate.purchases.push({ ...duplicate.purchases[0], id: "other" });
  assert.equal(isAppData(duplicate), false);
  assert.throws(() => parseImport(JSON.stringify(duplicate)));
  duplicate.purchases.pop();
  duplicate.purchases[0].installment = { current: 7, total: 3 };
  assert.equal(isAppData(duplicate), false);
  let raw = "";
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  saveData(storage, data);
  assert.deepEqual(loadData(storage).data, data);
  const before = raw;
  assert.throws(() =>
    saveData(
      {
        ...storage,
        setItem: () => {
          throw Error("quota");
        },
      },
      savePurchase(data, "a", "2026-10", draft),
    ),
  );
  assert.equal(raw, before);
  const source = fixture();
  assert.throws(() => savePurchase(source, "a", "9999-12", draft));
  assert.equal(source.purchases.length, 0);
});
