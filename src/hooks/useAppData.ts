import { useCallback, useState } from "react";
import { type AppData } from "../domain/models";
import { loadData, saveData, type StoragePort } from "../services/storage";
const browserStorage: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export function useAppData() {
  const [initial] = useState(() => loadData(browserStorage));
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.message);
  const update = useCallback(
    (next: AppData): boolean => {
      if (!initial.writable) return false;
      try {
        saveData(browserStorage, next);
        setData(next);
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível salvar.");
        return false;
      }
    },
    [initial.writable],
  );
  return { data, update, error, writable: initial.writable };
}
