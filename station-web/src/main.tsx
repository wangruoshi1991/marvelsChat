import React from "react";
import { createRoot } from "react-dom/client";
import { HomepageApp } from "./HomepageApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
  <React.StrictMode>
    <HomepageApp />
  </React.StrictMode>,
);
