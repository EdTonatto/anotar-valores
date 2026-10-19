import type { AppData, Cartao, Compra } from "./models";
import { selectInvoice } from "./peopleAndInvoices";
export interface CardSummary {
  card: Cartao;
  purchases: Compra[];
  subtotalCents: bigint;
}
/** Fonte única para tela e relatórios: totais derivados, nunca persistidos. */
export function selectInvoiceSummary(
  data: AppData,
  personId: string,
  reference: string,
) {
  const { invoice, purchases } = selectInvoice(data, personId, reference);
  const groups: CardSummary[] = data.cards.map((card) => ({
    card,
    purchases: [],
    subtotalCents: 0n,
  }));
  const byCard = new Map(groups.map((group) => [group.card.id, group]));
  for (const purchase of purchases) {
    const group = byCard.get(purchase.cardId);
    if (!group) throw new Error("Compra vinculada a um cartão inexistente.");
    group.purchases.push(purchase);
    group.subtotalCents += BigInt(purchase.amountCents);
  }
  return {
    invoice,
    groups,
    purchaseCount: purchases.length,
    totalCents: groups.reduce((sum, group) => sum + group.subtotalCents, 0n),
  };
}
export function formatCents(cents: bigint): string {
  const reais = new Intl.NumberFormat("pt-BR").format(cents / 100n);
  return `R$ ${reais},${String(cents % 100n).padStart(2, "0")}`;
}
