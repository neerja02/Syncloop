import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildPlan } from "../domain/catalog";
import { isoToday } from "../domain/dates";
import { buildDoses, makePerson } from "../domain/samples";
import type { ChatItem, Chip, Person, Profile } from "../domain/types";

export type Tab = "talk" | "today" | "health" | "profile";
export type Overlay = null | "call" | "wa" | "ob" | "sos";

/**
 * Each account keeps its own family data in this browser, under "sister-asha-v1:<user id>".
 * Nothing is read or written while nobody is signed in.
 */
const BASE_KEY = "sister-asha-v1";
let userId: string | null = null;
export const dataKey = (id = userId) => `${BASE_KEY}:${id}`;

const userStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    if (!userId) return null;
    try {
      const own = localStorage.getItem(`${name}:${userId}`);
      if (own !== null) return own;
      // Data saved before accounts existed goes to the first account that signs in on this browser.
      const legacy = localStorage.getItem(name);
      if (legacy !== null) {
        localStorage.setItem(`${name}:${userId}`, legacy);
        localStorage.removeItem(name);
      }
      return legacy;
    } catch { return null; }
  },
  setItem: (name: string, value: string) => {
    if (!userId) return;
    try { localStorage.setItem(`${name}:${userId}`, value); } catch { /* storage full or blocked */ }
  },
  removeItem: (name: string) => {
    if (!userId) return;
    try { localStorage.removeItem(`${name}:${userId}`); } catch { /* ignore */ }
  },
}));

interface Toast { html: string; undo?: () => void; id: number }

interface State {
  baseDate: string;
  day: number;
  people: Person[];
  cur: number;
  tab: Tab;
  overlay: Overlay;
  callKind: "daily" | "weekly";
  realVoice: boolean;
  /** Chat text size for people with weak eyesight: 1 = normal. */
  textScale: number;
  obEdit: number | null;
  typing: boolean;
  toast: Toast | null;

  current: () => Person | undefined;
  /** Change a person in place (by id, default: current). */
  mutate: (fn: (p: Person) => void, id?: string) => void;
  push: (item: ChatItem, id?: string) => void;
  setChips: (chips: Chip[]) => void;
  setTyping: (v: boolean) => void;
  showToast: (html: string, undo?: () => void) => void;
  hideToast: () => void;
  setTab: (t: Tab) => void;
  setOverlay: (o: Overlay) => void;
  openCall: (kind: "daily" | "weekly") => void;
  openSos: () => void;
  setRealVoice: (v: boolean) => void;
  setTextScale: (v: number) => void;
  openOnboarding: (edit: number | null) => void;
  addPerson: (pr: Profile) => void;
  saveProfile: (index: number, pr: Profile) => void;
  setCur: (i: number) => void;
  nextDay: () => void;
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      baseDate: isoToday(),
      day: 0,
      people: [],
      cur: -1,
      tab: "talk",
      overlay: "ob",
      callKind: "daily",
      realVoice: true,
      textScale: 1,
      obEdit: null,
      typing: false,
      toast: null,

      current: () => get().people[get().cur],
      mutate: (fn, id) =>
        set((s) => {
          const idx = id ? s.people.findIndex((p) => p.id === id) : s.cur;
          if (idx < 0 || !s.people[idx]) return {};
          const people = [...s.people];
          const p = structuredClone(people[idx]);
          fn(p);
          people[idx] = p;
          return { people };
        }),
      push: (item, id) => get().mutate((p) => void p.log.push(item), id),
      setChips: (chips) => get().mutate((p) => void (p.chips = chips)),
      setTyping: (typing) => set({ typing }),
      showToast: (html, undo) => set({ toast: { html, undo, id: Date.now() } }),
      hideToast: () => set({ toast: null }),
      setTab: (tab) => set({ tab }),
      setOverlay: (overlay) => set({ overlay }),
      openCall: (callKind) => set({ overlay: "call", callKind }),
      openSos: () => set({ overlay: "sos" }),
      setRealVoice: (realVoice) => set({ realVoice }),
      setTextScale: (textScale) => set({ textScale }),
      openOnboarding: (obEdit) => set({ overlay: "ob", obEdit }),
      addPerson: (pr) => set((s) => ({ people: [...s.people, makePerson(pr)], cur: s.people.length, overlay: null, tab: "talk" })),
      saveProfile: (index, pr) =>
        set((s) => {
          const people = [...s.people];
          const p = structuredClone(people[index]);
          p.pr = pr;
          p.plan = buildPlan(pr);
          p.doses = buildDoses(pr, p.doses);
          people[index] = p;
          return { people, overlay: null };
        }),
      setCur: (cur) => set({ cur }),
      nextDay: () =>
        set((s) => ({
          day: s.day + 1,
          people: s.people.map((p) => ({ ...p, doses: p.doses.map((d) => ({ ...d, taken: null })), chips: [] })),
        })),
      reset: () => set({ baseDate: isoToday(), day: 0, people: [], cur: -1, tab: "talk", overlay: "ob", obEdit: null, typing: false, toast: null }),
    }),
    {
      name: BASE_KEY,
      storage: userStorage,
      skipHydration: true,
      partialize: (s) => ({ baseDate: s.baseDate, day: s.day, people: s.people, cur: s.cur, realVoice: s.realVoice, textScale: s.textScale }),
      onRehydrateStorage: () => (s) => {
        if (s && s.people.length) s.overlay = null;
      },
    },
  ),
);

/** Switches the app to this account's saved data (null when logging out). */
export async function loadUserData(id: string | null) {
  userId = null; // so clearing the screen doesn't overwrite anyone's saved data
  useStore.getState().reset();
  useStore.setState({ realVoice: true, textScale: 1 });
  userId = id;
  if (id) await useStore.persist.rehydrate();
}

export const getState = () => useStore.getState();
export const cur = () => getState().current();
