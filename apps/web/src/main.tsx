import { createRoot } from "react-dom/client";
import React from "react";
import { App } from "./app/App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
