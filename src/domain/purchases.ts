import { createId, type AppData } from "./models";
import {
  ensureInvoice,
  normalizeName,
  selectInvoice,
} from "./peopleAndInvoices";
export type PurchaseField =
  "description" | "amount" | "cardId" | "current" | "total";
export class PurchaseError extends Error {
  constructor(
    public field: PurchaseField,
    message: string,
  ) {
    super(message);
  }
}
export interface PurchaseDraft {
  description: string;
  cardId: string;
  amount: string;
  parcelled: boolean;
  current: string;
  total: string;
}
/** Aceita reais em formato brasileiro: 1234,56 ou 1.234,56; ponto decimal é rejeitado. */
export function parseAmount(value: string): number {
  const clean = value.trim();
  if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean))
    throw new PurchaseError(
      "amount",
      "Use reais no formato 1234,56 ou 1.234,56, sem R$ e sem ponto decimal.",
    );
  const [whole, fraction = ""] = clean.replaceAll(".", "").split(",");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PurchaseError(
      "amount",
      "Informe um valor maior que zero dentro do limite permitido.",
    );
  return Number(cents);
}
export const amountInput = (cents: number) =>
  `${BigInt(cents) / 100n},${String(BigInt(cents) % 100n).padStart(2, "0")}`;
/** Cada dígito digitado representa centavos, como em aplicativos de banco. */
export function maskAmountInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.replace(/^0+/, "").padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${whole},${padded.slice(-2)}`;
}
export function savePurchase(
  data: AppData,
  personId: string,
  reference: string,
  draft: PurchaseDraft,
  purchaseId?: string,
): AppData {
  const description = normalizeName(draft.description);
  if (!description)
    throw new PurchaseError("description", "Informe a descrição da compra.");
  if (!data.cards.some((c) => c.id === draft.cardId))
    throw new PurchaseError("cardId", "Selecione um cartão válido.");
  const amountCents = parseAmount(draft.amount);
  let installment = null;
  if (draft.parcelled) {
    const read = (value: string, field: "current" | "total") => {
      if (
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 1
      )
        throw new PurchaseError(
          field,
          "Informe uma parcela inteira maior ou igual a 1.",
        );
      return Number(value);
    };
    const current = read(draft.current, "current"),
      total = read(draft.total, "total");
    if (current > total)
      throw new PurchaseError(
        "current",
        "A parcela atual não pode ser maior que o total de parcelas.",
      );
    installment = { current, total };
  }
  const selected = selectInvoice(data, personId, reference);
  const existing = purchaseId
    ? selected.purchases.find((p) => p.id === purchaseId)
    : undefined;
  if (purchaseId && !existing)
    throw new Error("Compra não encontrada nesta pessoa e competência.");
  const next = ensureInvoice(data, personId, reference);
  const invoice = selectInvoice(next, personId, reference).invoice!;
  const now = new Date().toISOString();
  const purchase = {
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    id: existing?.id ?? createId(),
    invoiceId: invoice.id,
    cardId: draft.cardId,
    description,
    amountCents,
    installment,
  };
  return {
    ...next,
    invoices: next.invoices.map((f) =>
      f.id === invoice.id
        ? {
            ...f,
            updatedAt: now,
            cardUpdatedAt: {
              ...f.cardUpdatedAt,
              [draft.cardId]: now,
              ...(existing ? { [existing.cardId]: now } : {}),
            },
          }
        : f,
    ),
    purchases: existing
      ? next.purchases.map((p) => (p.id === existing.id ? purchase : p))
      : [...next.purchases, purchase],
  };
}
export function deletePurchase(
  data: AppData,
  personId: string,
  reference: string,
  purchaseId: string,
): AppData {
  if (
    !selectInvoice(data, personId, reference).purchases.some(
      (p) => p.id === purchaseId,
    )
  )
    throw new Error("Compra não encontrada nesta pessoa e competência.");
  const purchase = data.purchases.find((p) => p.id === purchaseId)!;
  const now = new Date().toISOString();
  return {
    ...data,
    invoices: data.invoices.map((f) =>
      f.id === purchase.invoiceId
        ? {
            ...f,
            updatedAt: now,
            cardUpdatedAt: { ...f.cardUpdatedAt, [purchase.cardId]: now },
          }
        : f,
    ),
    purchases: data.purchases.filter((p) => p.id !== purchaseId),
  };
}
