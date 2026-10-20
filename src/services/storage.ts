import { createEmptyData, isAppData, type AppData } from "../domain/models";
export const STORAGE_KEY = "anotar-valores:data";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type LoadResult = {
  data: AppData;
  writable: boolean;
  message: string | null;
};
export function loadData(storage: StoragePort): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null)
      return { data: createEmptyData(), writable: true, message: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isAppData(parsed)) throw new Error("Invalid data");
    return { data: parsed, writable: true, message: null };
  } catch {
    return {
      data: createEmptyData(),
      writable: false,
      message:
        "Não foi possível carregar os dados salvos. O conteúdo original foi preservado e novas gravações estão bloqueadas. Verifique o acesso ao armazenamento ou recupere seu backup antes de continuar.",
    };
  }
}
export function saveData(storage: StoragePort, data: AppData): void {
  if (!isAppData(data))
    throw new Error(
      "Os dados não seguem o formato esperado. Nada foi gravado.",
    );
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "Não foi possível salvar neste navegador. O espaço pode estar cheio ou o armazenamento bloqueado. A alteração não foi aplicada.",
    );
  }
}
