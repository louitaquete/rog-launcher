import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/900-italic.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "./styles.css";
import App from "./App";
import { installFeel } from "./lib/feel";

installFeel();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
