import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DialogRequest, ShellData } from "./types";

export interface ShellConversation {
  id: string;
  profileId: string;
  onProfileChanged?: (messages: unknown[], profileId: string) => void;
}

interface ShellCtx extends ShellData {
  dialog: DialogRequest | null;
  openDialog: (d: DialogRequest) => void;
  closeDialog: () => void;
  /** Set by the chat page so the header's profile selector changes the conversation's subject. */
  conversation: ShellConversation | null;
  registerConversation: (c: ShellConversation) => void;
  /** Clears the registration only if it still belongs to `id` (pages hidden by the router may clean up late). */
  unregisterConversation: (id: string) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (o: boolean) => void;
}

const Ctx = createContext<ShellCtx | null>(null);

export function ShellProvider({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [conversation, setConversation] = useState<ShellConversation | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openDialog = useCallback((d: DialogRequest) => setDialog(d), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const registerConversation = useCallback((c: ShellConversation) => setConversation(c), []);
  const unregisterConversation = useCallback((id: string) => setConversation((c) => (c?.id === id ? null : c)), []);
  const value = useMemo(
    () => ({ ...data, dialog, openDialog, closeDialog, conversation, registerConversation, unregisterConversation, mobileNavOpen, setMobileNavOpen }),
    [data, dialog, openDialog, closeDialog, conversation, registerConversation, unregisterConversation, mobileNavOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShell must be used inside ShellProvider");
  return c;
}

export function useOptionalShell() {
  return useContext(Ctx);
}
