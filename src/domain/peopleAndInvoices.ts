import { createId, type AppData } from "./models";
export const normalizeName = (name: string): string =>
  name.trim().replace(/\s+/gu, " ").normalize("NFC");
const nameKey = (name: string) =>
  normalizeName(name).toLocaleLowerCase("pt-BR");
export const isReference = (value: string): boolean =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function currentReference(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function formatReference(reference: string): string {
  if (!isReference(reference)) return "Selecione mês e ano";
  const [year, month] = reference.split("-").map(Number);
  return `${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2000, month - 1, 1))} de ${year}`;
}
export function savePerson(
  data: AppData,
  name: string,
  personId?: string,
): { data: AppData; personId: string } {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Informe o nome da pessoa.");
  if (personId && !data.people.some((p) => p.id === personId))
    throw new Error("Pessoa não encontrada.");
  if (
    data.people.some(
      (p) => p.id !== personId && nameKey(p.name) === nameKey(normalized),
    )
  )
    throw new Error("Já existe uma pessoa com esse nome.");
  const id = personId ?? createId();
  return {
    personId: id,
    data: {
      ...data,
      people: personId
        ? data.people.map((p) => (p.id === id ? { ...p, name: normalized } : p))
        : [...data.people, { id, name: normalized }],
    },
  };
}
export function ensureInvoice(
  data: AppData,
  personId: string,
  reference: string,
): AppData {
  if (!data.people.some((p) => p.id === personId))
    throw new Error("Selecione uma pessoa válida.");
  if (!isReference(reference)) throw new Error("Informe um mês e ano válidos.");
  if (
    data.invoices.some(
      (f) => f.personId === personId && f.reference === reference,
    )
  )
    return data;
  return {
    ...data,
    invoices: [...data.invoices, { id: createId(), personId, reference }],
  };
}
export function selectInvoice(
  data: AppData,
  personId: string,
  reference: string,
) {
  const invoice = data.invoices.find(
    (f) => f.personId === personId && f.reference === reference,
  );
  return {
    invoice,
    purchases: invoice
      ? data.purchases.filter((p) => p.invoiceId === invoice.id)
      : [],
  };
}
