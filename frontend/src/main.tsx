/** Browser entry point that mounts the React application into the Vite root element. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./assets/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
