import type { AppData, Compra } from "./models";

export interface DashboardFilters {
  from: string;
  to: string;
  people: string[];
  cards: string[];
  purchaseType: "all" | "single" | "installment";
  status: "active" | "all" | "reimbursed";
  minCents: number | null;
  maxCents: number | null;
}
export interface DashboardPurchase extends Compra {
  personId: string;
  personName: string;
  cardName: string;
  reference: string;
}
export interface AnalyticsRow {
  id: string;
  name: string;
  totalCents: bigint;
  purchaseCount: number;
  averageCents: bigint;
  sharePercent: number;
}
export const emptyDashboardFilters = (): DashboardFilters => ({
  from: "",
  to: "",
  people: [],
  cards: [],
  purchaseType: "all",
  status: "active",
  minCents: null,
  maxCents: null,
});
const validReference = (value: string) =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function listReferences(data: AppData): string[] {
  return [...new Set(data.invoices.map((invoice) => invoice.reference))].sort();
}

export function getDashboardPurchases(
  data: AppData,
  filters: DashboardFilters,
): DashboardPurchase[] {
  const invoices = new Map(
    data.invoices.map((invoice) => [invoice.id, invoice]),
  );
  const people = new Map(data.people.map((person) => [person.id, person]));
  const cards = new Map(data.cards.map((card) => [card.id, card]));
  return data.purchases.flatMap((purchase) => {
    const invoice = invoices.get(purchase.invoiceId);
    const owner = invoice && people.get(invoice.personId);
    const card = cards.get(purchase.cardId);
    if (!invoice || !owner || !card) return [];
    if (validReference(filters.from) && invoice.reference < filters.from)
      return [];
    if (validReference(filters.to) && invoice.reference > filters.to) return [];
    if (filters.cards.length && !filters.cards.includes(card.id)) return [];
    if (filters.purchaseType === "single" && purchase.installment) return [];
    if (filters.purchaseType === "installment" && !purchase.installment)
      return [];
    if (filters.status === "active" && purchase.reimbursed) return [];
    if (filters.status === "reimbursed" && !purchase.reimbursed) return [];
    const participants = purchase.participants ?? [
      { personId: owner.id, amountCents: purchase.amountCents },
    ];
    return participants
      .filter(
        (participant) =>
          !filters.people.length ||
          filters.people.includes(participant.personId),
      )
      .flatMap((participant) => {
        const person = people.get(participant.personId);
        if (
          !person ||
          (filters.minCents !== null &&
            participant.amountCents < filters.minCents) ||
          (filters.maxCents !== null &&
            participant.amountCents > filters.maxCents)
        )
          return [];
        return [
          {
            ...purchase,
            amountCents: participant.amountCents,
            personId: person.id,
            personName: person.name,
            cardName: card.name,
            reference: invoice.reference,
          },
        ];
      });
  });
}
const active = (rows: DashboardPurchase[]) =>
  rows.filter((row) => !row.reimbursed);
const sum = (rows: DashboardPurchase[], dimension?: "person" | "card") =>
  active(rows).reduce(
    (total, row) =>
      total +
      BigInt(
        dimension === "card"
          ? (row.participants?.reduce(
              (subtotal, participant) => subtotal + participant.amountCents,
              0,
            ) ?? row.amountCents)
          : row.amountCents,
      ),
    0n,
  );
function rowsFor(
  purchases: DashboardPurchase[],
  dimension: "person" | "card",
): AnalyticsRow[] {
  const groups = new Map<
    string,
    { name: string; purchases: DashboardPurchase[] }
  >();
  for (const purchase of purchases) {
    const id = dimension === "person" ? purchase.personId : purchase.cardId;
    const name =
      dimension === "person" ? purchase.personName : purchase.cardName;
    const group = groups.get(id) ?? { name, purchases: [] };
    group.purchases.push(purchase);
    groups.set(id, group);
  }
  const total = sum(purchases, dimension);
  return [...groups].map(([id, group]) => {
    const included = active(group.purchases);
    const totalCents = sum(included, dimension);
    return {
      id,
      name: group.name,
      totalCents,
      purchaseCount: included.length,
      averageCents: included.length ? totalCents / BigInt(included.length) : 0n,
      sharePercent: total ? Number((totalCents * 10000n) / total) / 100 : 0,
    };
  });
}
function makeMonths(from: string, to: string, fallback: string[]): string[] {
  const last = validReference(to) ? to : fallback.at(-1);
  let first = validReference(from) ? from : fallback[0];
  if (!from && !to && last) {
    const [year, month] = last.split("-").map(Number);
    const start = year * 12 + month - 1 - 5;
    first = `${Math.floor(start / 12)}-${String((start % 12) + 1).padStart(2, "0")}`;
  }
  if (!first || !last || first > last) return [];
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  const [endYear, endMonth] = last.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}
export function getDashboardAnalytics(
  data: AppData,
  filters: DashboardFilters,
) {
  const purchases = getDashboardPurchases(data, filters);
  const included = active(purchases);
  const totalCents = sum(purchases, "card");
  const byPerson = rowsFor(purchases, "person");
  const byCard = rowsFor(purchases, "card");
  const personCard = byPerson.map((person) => ({
    person,
    cards: byCard.map((card) => ({
      card,
      totalCents: sum(
        purchases.filter(
          (purchase) =>
            purchase.personId === person.id && purchase.cardId === card.id,
        ),
        "person",
      ),
    })),
  }));
  const monthRefs = makeMonths(filters.from, filters.to, listReferences(data));
  const monthlyPurchases = getDashboardPurchases(data, {
    ...filters,
    from: "",
    to: "",
  });
  const months = monthRefs.map((reference) => ({
    reference,
    totalCents: sum(
      monthlyPurchases.filter((purchase) => purchase.reference === reference),
      "card",
    ),
  }));
  const largestPurchase = included.reduce<DashboardPurchase | null>(
    (largest, purchase) =>
      !largest || purchase.amountCents > largest.amountCents
        ? purchase
        : largest,
    null,
  );
  const leadingPerson = [...byPerson]
    .filter((row) => row.totalCents > 0n)
    .sort((a, b) =>
      a.totalCents === b.totalCents ? 0 : a.totalCents > b.totalCents ? -1 : 1,
    )[0];
  const leadingCard = [...byCard]
    .filter((row) => row.totalCents > 0n)
    .sort((a, b) =>
      a.totalCents === b.totalCents ? 0 : a.totalCents > b.totalCents ? -1 : 1,
    )[0];
  return {
    purchases,
    included,
    totalCents,
    purchaseCount: included.length,
    peopleCount: new Set(included.map((p) => p.personId)).size,
    cardsCount: new Set(included.map((p) => p.cardId)).size,
    averageCents: included.length ? totalCents / BigInt(included.length) : 0n,
    leadingPerson,
    leadingCard,
    largestPurchase,
    byPerson,
    byCard,
    personCard,
    months,
  };
}
export function sortAnalyticsRows(
  rows: AnalyticsRow[],
  sort: "value-desc" | "value-asc" | "count",
) {
  return [...rows].sort((a, b) => {
    if (sort === "count")
      return (
        b.purchaseCount - a.purchaseCount ||
        a.name.localeCompare(b.name, "pt-BR")
      );
    if (a.totalCents === b.totalCents)
      return a.name.localeCompare(b.name, "pt-BR");
    return sort === "value-desc"
      ? a.totalCents > b.totalCents
        ? -1
        : 1
      : a.totalCents < b.totalCents
        ? -1
        : 1;
  });
}
