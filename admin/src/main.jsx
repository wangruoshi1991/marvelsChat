import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Refine } from "@refinedev/core";
import { ConfigProvider, unstableSetRender } from "antd";
import App from "./App.jsx";
import { authProvider, accessControlProvider, dataProvider } from "./platform.js";
import "antd/dist/reset.css";

// Ant Design 5's wave effects and static dialogs use its public render adapter.
// React 19 removed ReactDOM.render, so use the same supported client root API.
const transientRoots = new WeakMap();
unstableSetRender((node, container) => {
  let root = transientRoots.get(container);
  if (!root) { root = createRoot(container); transientRoots.set(container, root); }
  root.render(node);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (transientRoots.get(container) === root) { root.unmount(); transientRoots.delete(container); }
  };
});

createRoot(document.getElementById("admin-root")).render(
  <React.StrictMode>
    <ConfigProvider theme={{ token: { colorPrimary: "#177b70", borderRadius: 6, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }, components: { Layout: { siderBg: "#122b2a", triggerBg: "#122b2a" }, Table: { headerBg: "#f5f7f7" } } }}>
      <BrowserRouter basename="/admin">
        <Refine dataProvider={dataProvider} authProvider={authProvider} accessControlProvider={accessControlProvider} resources={[]} options={{ syncWithLocation: true, warnWhenUnsavedChanges: false, disableTelemetry: true }}>
          <App />
        </Refine>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
