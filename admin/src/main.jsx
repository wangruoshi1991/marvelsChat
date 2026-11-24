import React from "react";
import { BrowserRouter } from "react-router-dom";
import { Refine } from "@refinedev/core";
import { ConfigProvider } from "antd";
import App from "./App.jsx";
import { mountAdminApp } from "./app-shell.js";
import { authProvider, accessControlProvider, dataProvider } from "./platform.js";
import "antd/dist/reset.css";

mountAdminApp(
  document.getElementById("admin-root"),
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
