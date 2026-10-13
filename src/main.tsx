import { ConversationProvider } from "@elevenlabs/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: its double-mount would start and immediately end the live voice session.
createRoot(document.getElementById("root")!).render(
  <ConversationProvider>
    <App />
  </ConversationProvider>,
);
