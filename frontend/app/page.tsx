"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeploymentHistory, getSettings } from "./lib/storage";
import Sidebar from "./components/Sidebar";
import LandingScreen from "./components/LandingScreen";
import CompleteScreen from "./components/CompleteScreen";
import ChatPanel from "./components/ChatPanel";
import Dashboard from "./dashboard/Dashboard";
import ProvisionWizard from "./provision/ProvisionWizard";
import Settings from "./settings/Settings";

type Page = "welcome" | "dashboard" | "provision" | "settings" | "complete" | "chat";

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [isFirstRun, setIsFirstRun] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const [lastDeployInfo, setLastDeployInfo] = useState<{ provider: string; model: string }>({ provider: "Microsoft Azure", model: "" });
  const [chatUrl, setChatUrl] = useState("");

  useEffect(() => {
    const history = getDeploymentHistory();
    const settings = getSettings();
    const hasNoHistory = history.length === 0;
    const hasNoCredentials = settings.savedCredentials === null;

    if (hasNoHistory && hasNoCredentials) {
      setIsFirstRun(true);
      setCurrentPage("welcome");
    } else {
      setCurrentPage("dashboard");
    }
    setReady(true);
  }, []);

  const handleNavigate = useCallback((page: string): void => {
    if (page === "complete") {
      try {
        const raw = localStorage.getItem("_privateai_last_deploy");
        if (raw) setLastDeployInfo(JSON.parse(raw));
      } catch {}
    }
    if (page === "chat") {
      const url = localStorage.getItem("_privateai_chat_url") ?? "";
      setChatUrl(url);
    }
    setCurrentPage(page as Page);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean): void => {
    setSidebarCollapsed(collapsed);
  }, []);

  // Avoid flash of content before mount check completes
  if (!ready) {
    return null;
  }

  const showSidebar = currentPage !== "welcome" && currentPage !== "complete" && currentPage !== "chat";

  return (
    <div className="flex min-h-screen">
      {showSidebar && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onCollapsedChange={handleCollapsedChange}
        />
      )}

      <main
        className="flex-1 overflow-y-auto transition-[margin-left] duration-300 ease-in-out"
        style={{
          marginLeft: showSidebar ? (sidebarCollapsed ? "64px" : "220px") : 0,
        }}
      >
        <div key={currentPage} className="animate-[fade-in_0.2s_ease-out]">
          {currentPage === "welcome" && (
            <LandingScreen onGetStarted={() => setCurrentPage("provision")} />
          )}
          {currentPage === "complete" && (
            <CompleteScreen
              provider={lastDeployInfo.provider}
              model={lastDeployInfo.model}
              onStartChat={() => setCurrentPage("dashboard")}
            />
          )}
          {currentPage === "dashboard" && (
            <Dashboard onNavigate={handleNavigate} />
          )}
          {currentPage === "provision" && (
            <ProvisionWizard onNavigate={handleNavigate} />
          )}
          {currentPage === "settings" && <Settings onNavigate={handleNavigate} />}
          {currentPage === "chat" && (
            <ChatPanel openwebuiUrl={chatUrl} onClose={() => handleNavigate("dashboard")} />
          )}
        </div>
      </main>
    </div>
  );
}
