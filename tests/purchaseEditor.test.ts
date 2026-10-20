import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseEditor } from "../src/components/PurchaseEditor";
import { createEmptyData } from "../src/domain/models";
test("edição preenche compras à vista e parceladas sem erro de campos nulos", () => {
  for (const installment of [null, { current: 2, total: 5 }]) {
    const html = renderToStaticMarkup(
      createElement(PurchaseEditor, {
        data: { ...createEmptyData(), cards: [{ id: "c", name: "Cartão" }] },
        update: () => true,
        writable: true,
        personId: "p",
        reference: "2026-10",
        purchase: {
          id: "b",
          invoiceId: "f",
          cardId: "c",
          description: "Compra existente",
          amountCents: 1234,
          installment,
        },
        onDone: () => {},
      }),
    );
    assert.ok(html.includes("Compra existente"));
    assert.ok(html.includes("12,34"));
    assert.ok(html.includes("Cancelar edição"));
    assert.equal(html.includes('id="purchase-current"'), installment !== null);
  }
});
