import { SkinGlobalPage } from "./pages/SkinPages";
import { Home } from "./pages/Home";
import { ExploreModpacks } from "./pages/ExploreModpacks";
import { LoginModal } from "./components/LoginModal";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { InstanceList } from "./pages/InstanceList";
import { InstancePage } from "./pages/InstancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppProvider } from "./lib/store";

export default function App() {
  return (
    <AppProvider>
    <HashRouter>
      <div className="flex h-full flex-col">
        <TitleBar />
        <LoginModal />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 bg-bg">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/vanilla" element={<InstanceList filter="vanilla" />} />
              <Route path="/vanilla/:id" element={<Navigate to="conteudo" replace />} />
              <Route path="/vanilla/:id/:tab" element={<InstancePage area="vanilla" />} />
              <Route path="/mods" element={<InstanceList filter="mods" />} />
              <Route path="/mods/explorar" element={<ExploreModpacks />} />
              <Route path="/mods/:id" element={<Navigate to="conteudo" replace />} />
              <Route path="/mods/:id/:tab" element={<InstancePage area="mods" />} />
              <Route path="/pvp" element={<Navigate to="/pvp/jogar" replace />} />
              <Route path="/pvp/:tab" element={<InstancePage area="pvp" />} />
              <Route path="/skin" element={<SkinGlobalPage />} />
              <Route path="/config" element={<Navigate to="/config/geral" replace />} />
              <Route path="/config/:section" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
    </AppProvider>
  );
}
