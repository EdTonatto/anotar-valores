import { createId, type Compra, type AppData } from "./models";
import {
  ensureInvoice,
  normalizeName,
  selectInvoice,
} from "./peopleAndInvoices";
export type PurchaseField =
  "description" | "amount" | "cardId" | "personId" | "current" | "total";
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
  participants?: { personId: string; share: string }[];
}
/** Converte proporções decimais para uma alocação inteira de centavos que fecha exatamente. */
export function allocateShares(
  amountCents: number,
  participants: { personId: string; share: string }[],
): { personId: string; amountCents: number }[] {
  if (
    participants.length < 2 ||
    new Set(participants.map((p) => p.personId)).size !== participants.length
  )
    throw new PurchaseError(
      "personId",
      "Selecione ao menos duas pessoas diferentes.",
    );
  const weights = participants.map(({ personId, share }) => {
    const fractionInput = share.trim();
    if (/^\d+\/\d+$/.test(fractionInput)) {
      const [numerator, denominator] = fractionInput.split("/").map(BigInt);
      if (numerator <= 0n || denominator <= 0n)
        throw new PurchaseError(
          "personId",
          "Informe uma proporção válida para cada pessoa.",
        );
      return { personId, weight: numerator, scale: denominator };
    }
    const clean = fractionInput.replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(clean) || Number(clean) <= 0)
      throw new PurchaseError(
        "personId",
        "Informe uma proporção válida para cada pessoa.",
      );
    const [whole, fraction = ""] = clean.split(".");
    const scale = 10n ** BigInt(fraction.length);
    return {
      personId,
      weight: BigInt(whole) * scale + BigInt(fraction),
      scale,
    };
  });
  const scale = weights.reduce(
    (common, item) => (common * item.scale) / gcd(common, item.scale),
    1n,
  );
  const normalized = weights.map((item) => item.weight * (scale / item.scale));
  const totalWeight = normalized.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight !== scale)
    throw new PurchaseError(
      "personId",
      "A soma das proporções deve ser exatamente 1 (100%).",
    );
  let assigned = 0;
  return normalized.map((weight, index) => {
    const cents =
      index === normalized.length - 1
        ? amountCents - assigned
        : Number((BigInt(amountCents) * weight) / totalWeight);
    assigned += cents;
    if (cents <= 0)
      throw new PurchaseError(
        "personId",
        "Cada participante precisa receber ao menos R$ 0,01.",
      );
    return { personId: participants[index].personId, amountCents: cents };
  });
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
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
export type SeriesScope = "single" | "following" | "all";
export function advanceReference(reference: string, months: number): string {
  const [year, month] = reference.split("-").map(Number);
  const index = year * 12 + month - 1 + months;
  const y = Math.floor(index / 12);
  if (!Number.isSafeInteger(index) || y < 1 || y > 9999)
    throw new PurchaseError(
      "total",
      "Parcelamento ultrapassa o limite de competências.",
    );
  return `${String(y).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}
export function savePurchase(
  data: AppData,
  personId: string,
  reference: string,
  draft: PurchaseDraft,
  purchaseId?: string,
  targetPersonId = personId,
  scope: SeriesScope = "single",
  participants?: { personId: string; share: string }[],
): AppData {
  const description = normalizeName(draft.description);
  if (!description)
    throw new PurchaseError("description", "Informe a descrição da compra.");
  if (!data.cards.some((c) => c.id === draft.cardId))
    throw new PurchaseError("cardId", "Selecione um cartão válido.");
  const amountCents = parseAmount(draft.amount);
  let installment: Compra["installment"] = null;
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
  if (!data.people.some((p) => p.id === targetPersonId))
    throw new PurchaseError("personId", "Selecione uma pessoa válida.");
  if (
    existing?.installmentSeriesId &&
    installment &&
    installment.current !== existing.installment?.current
  )
    throw new PurchaseError(
      "current",
      "O número da parcela de uma série não pode ser alterado.",
    );
  if (
    existing?.installmentSeriesId &&
    scope === "single" &&
    installment &&
    installment.total !== existing.installment?.total
  )
    throw new PurchaseError(
      "total",
      "Para alterar o total, selecione esta e as próximas ou toda a série.",
    );
  const seriesId =
    existing?.installmentSeriesId ??
    (!existing && installment ? createId() : undefined);
  const series = seriesId
    ? data.purchases.filter((p) => p.installmentSeriesId === seriesId)
    : [];
  const identifiedSeries = !!existing?.installmentSeriesId;
  if (existing && scope !== "single" && seriesId && !installment)
    throw new PurchaseError(
      "total",
      "Mantenha o parcelamento para editar a série. Para cancelar, exclua esta e as próximas.",
    );
  if (
    installment &&
    existing &&
    scope !== "single" &&
    series.some(
      (p) =>
        p.installment!.current > installment.total &&
        p.installment!.current < existing.installment!.current,
    )
  )
    throw new PurchaseError(
      "total",
      "O total não pode remover parcelas anteriores.",
    );
  let next = data;
  const now = new Date().toISOString();
  const affected = new Map<string, Set<string>>();
  function touch(invoiceId: string, cardId: string) {
    const cards = affected.get(invoiceId) ?? new Set<string>();
    cards.add(cardId);
    affected.set(invoiceId, cards);
  }
  let purchases = [...data.purchases];
  function put(
    old: Compra | undefined,
    ref: string,
    current: number | undefined,
  ) {
    next = ensureInvoice(next, targetPersonId, ref);
    const invoice = selectInvoice(next, targetPersonId, ref).invoice!;
    if (old) touch(old.invoiceId, old.cardId);
    touch(invoice.id, draft.cardId);
    const purchase: Compra = {
      ...old,
      id: old?.id ?? createId(),
      invoiceId: invoice.id,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      cardId: draft.cardId,
      description,
      amountCents,
      ...(participants && participants.length > 1
        ? { participants: allocateShares(amountCents, participants) }
        : { participants: undefined }),
      installment: installment
        ? { current: current!, total: installment.total }
        : null,
      ...(installment && seriesId ? { installmentSeriesId: seriesId } : {}),
    };
    if (!installment) delete purchase.installmentSeriesId;
    if (!participants || participants.length < 2) delete purchase.participants;
    purchases = old
      ? purchases.map((p) => (p.id === old.id ? purchase : p))
      : [...purchases, purchase];
  }
  if (
    (!existing && installment) ||
    (existing && seriesId && installment && scope !== "single")
  ) {
    const start = installment!.current;
    advanceReference(reference, installment!.total - start);
    for (const old of series) {
      const n = old.installment!.current;
      if (n > installment!.total && n >= start) {
        touch(old.invoiceId, old.cardId);
        purchases = purchases.filter((p) => p.id !== old.id);
      } else if (scope === "all" && n < start) {
        put(
          old,
          data.invoices.find((f) => f.id === old.invoiceId)!.reference,
          n,
        );
      }
    }
    for (let n = start; n <= installment!.total; n++) {
      const old = series.find((p) => p.installment!.current === n);
      if (scope !== "single" || !old)
        put(old, advanceReference(reference, n - start), n);
    }
  } else if (existing && identifiedSeries && installment) {
    put(existing, reference, installment.current);
    for (let n = installment.current + 1; n <= installment.total; n++) {
      const old = series.find((p) => p.installment!.current === n);
      if (!old)
        put(undefined, advanceReference(reference, n - installment.current), n);
    }
  } else {
    put(existing, reference, installment?.current);
    if (
      existing &&
      !existing.installmentSeriesId &&
      installment &&
      scope !== "single"
    ) {
      for (let n = installment.current + 1; n <= installment.total; n++)
        put(undefined, advanceReference(reference, n - installment.current), n);
    }
  }
  return {
    ...next,
    purchases,
    invoices: next.invoices.map((f) =>
      affected.has(f.id)
        ? {
            ...f,
            updatedAt: now,
            cardUpdatedAt: {
              ...f.cardUpdatedAt,
              ...Object.fromEntries(
                [...affected.get(f.id)!].map((c) => [c, now]),
              ),
            },
          }
        : f,
    ),
  };
}

export function deletePurchase(
  data: AppData,
  personId: string,
  reference: string,
  purchaseId: string,
  scope: "single" | "following" = "single",
): AppData {
  if (
    !selectInvoice(data, personId, reference).purchases.some(
      (p) => p.id === purchaseId,
    )
  )
    throw new Error("Compra não encontrada nesta pessoa e competência.");
  const purchase = data.purchases.find((p) => p.id === purchaseId)!;
  const removed = data.purchases.filter(
    (p) =>
      p.id === purchaseId ||
      (scope === "following" &&
        !!purchase.installmentSeriesId &&
        p.installmentSeriesId === purchase.installmentSeriesId &&
        p.installment!.current >= purchase.installment!.current),
  );
  const now = new Date().toISOString();
  return {
    ...data,
    invoices: data.invoices.map((f) =>
      removed.some((p) => p.invoiceId === f.id)
        ? {
            ...f,
            updatedAt: now,
            cardUpdatedAt: {
              ...f.cardUpdatedAt,
              ...Object.fromEntries(
                removed
                  .filter((p) => p.invoiceId === f.id)
                  .map((p) => [p.cardId, now]),
              ),
            },
          }
        : f,
    ),
    purchases: data.purchases.filter(
      (p) => !removed.some((old) => old.id === p.id),
    ),
  };
}

export function setPurchaseReimbursed(
  data: AppData,
  purchaseId: string,
  reimbursed: boolean,
): AppData {
  const purchase = data.purchases.find((p) => p.id === purchaseId);
  if (!purchase) throw new Error("Compra não encontrada.");
  const now = new Date().toISOString();
  return {
    ...data,
    purchases: data.purchases.map((p) =>
      p.id === purchaseId ? { ...p, reimbursed, updatedAt: now } : p,
    ),
    invoices: data.invoices.map((invoice) =>
      invoice.id === purchase.invoiceId
        ? {
            ...invoice,
            updatedAt: now,
            cardUpdatedAt: { ...invoice.cardUpdatedAt, [purchase.cardId]: now },
          }
        : invoice,
    ),
  };
}
