import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { App } from "./App";

function ClientApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <App />;
}

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ClientApp />
    </React.StrictMode>
  );
}
