import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type MotionLevel = "full" | "gentle" | "reduced";

type MotionContextValue = {
  level: MotionLevel;
  setLevel: (level: MotionLevel) => void;
};

const STORAGE_KEY = "kollywood-clash-motion";
const MotionContext = createContext<MotionContextValue | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<MotionLevel>("full");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "full" || saved === "gentle" || saved === "reduced") setLevel(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset["motion"] = level;
    window.localStorage.setItem(STORAGE_KEY, level);
  }, [level]);

  const value = useMemo(() => ({ level, setLevel }), [level]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionPreference() {
  const value = useContext(MotionContext);
  if (!value) throw new Error("useMotionPreference must be used inside MotionProvider");
  return value;
}
