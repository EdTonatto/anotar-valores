export const SCHEMA_VERSION = 1 as const;
export interface Pessoa {
  id: string;
  name: string;
}
export interface Cartao {
  id: string;
  name: string;
}
export interface Fatura {
  id: string;
  personId: string;
  reference: string;
}
export interface Compra {
  id: string;
  invoiceId: string;
  cardId: string;
  description: string;
  /** Valor cobrado nesta fatura, nunca o total da compra parcelada. */
  amountCents: number;
  installment: { current: number; total: number } | null;
}
export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  people: Pessoa[];
  cards: Cartao[];
  invoices: Fatura[];
  purchases: Compra[];
}
export const createEmptyData = (): AppData => ({
  schemaVersion: SCHEMA_VERSION,
  people: [],
  cards: [],
  invoices: [],
  purchases: [],
});
export const createId = (): string => crypto.randomUUID();
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v);
export function isAppData(value: unknown): value is AppData {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  const { people, cards, invoices, purchases } = value;
  if (![people, cards, invoices, purchases].every(Array.isArray)) return false;
  const ps = people as unknown[],
    cs = cards as unknown[],
    fs = invoices as unknown[],
    bs = purchases as unknown[];
  const validIds = (items: unknown[]) =>
    items.every((v) => record(v) && text(v.id)) &&
    new Set(items.map((v) => (v as Record<string, unknown>).id)).size ===
      items.length;
  if (![ps, cs, fs, bs].every(validIds)) return false;
  if (![...ps, ...cs].every((v) => record(v) && text(v.name))) return false;
  const personIds = new Set(ps.map((v) => (v as Pessoa).id));
  const cardIds = new Set(cs.map((v) => (v as Cartao).id));
  const invoiceIds = new Set(fs.map((v) => (v as Fatura).id));
  if (
    !fs.every(
      (v) =>
        record(v) &&
        text(v.personId) &&
        personIds.has(v.personId) &&
        typeof v.reference === "string" &&
        /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(v.reference),
    )
  )
    return false;
  if (
    new Set(
      fs.map((v) =>
        JSON.stringify([(v as Fatura).personId, (v as Fatura).reference]),
      ),
    ).size !== fs.length
  )
    return false;
  return bs.every((v) => {
    if (
      !record(v) ||
      !text(v.invoiceId) ||
      !invoiceIds.has(v.invoiceId) ||
      !text(v.cardId) ||
      !cardIds.has(v.cardId) ||
      !text(v.description) ||
      !integer(v.amountCents) ||
      v.amountCents <= 0
    )
      return false;
    const i = v.installment;
    return (
      i === null ||
      (record(i) &&
        integer(i.current) &&
        integer(i.total) &&
        i.current >= 1 &&
        i.total >= i.current)
    );
  });
}
