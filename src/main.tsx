import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { LocalDataStore } from "./storage";
import "./ui/styles.css";

const store = new LocalDataStore(window.localStorage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
