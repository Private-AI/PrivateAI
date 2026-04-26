"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeploymentHistory, getSettings } from "./lib/storage";
import { getSession, logout } from "./lib/auth";
import Sidebar from "./components/Sidebar";
import LandingScreen from "./components/LandingScreen";
import LoginScreen from "./components/LoginScreen";
import CompleteScreen from "./components/CompleteScreen";
import ChatPanel from "./components/ChatPanel";
import Dashboard from "./dashboard/Dashboard";
import ProvisionWizard from "./provision/ProvisionWizard";
import Settings from "./settings/Settings";

type Page = "welcome" | "login" | "dashboard" | "provision" | "settings" | "complete" | "chat";

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>("welcome");
  const [authed, setAuthed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [lastDeployInfo, setLastDeployInfo] = useState<{ provider: string; model: string }>({ provider: "Microsoft Azure", model: "" });
  const [chatUrl, setChatUrl] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) {
      // Not logged in — show public landing page
      setCurrentPage("welcome");
      setAuthed(false);
      setReady(true);
      return;
    }

    // Logged in — go to appropriate page
    setAuthed(true);
    const history = getDeploymentHistory();
    const settings = getSettings();
    const isFirstRun = history.length === 0 && settings.savedCredentials === null;
    setCurrentPage(isFirstRun ? "welcome" : "dashboard");
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
      if (!url) {
        setCurrentPage("dashboard");
        return;
      }
      setChatUrl(url);
    }
    setCurrentPage(page as Page);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  }, []);

  const handleLogin = useCallback(() => {
    setAuthed(true);
    const history = getDeploymentHistory();
    const settings = getSettings();
    const isFirstRun = history.length === 0 && settings.savedCredentials === null;
    setCurrentPage(isFirstRun ? "welcome" : "dashboard");
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setAuthed(false);
    setCurrentPage("welcome");
  }, []);

  const handleGetStarted = useCallback(() => {
    if (authed) {
      setCurrentPage("provision");
    } else {
      setCurrentPage("login");
    }
  }, [authed]);

  const handleSignIn = useCallback(() => {
    setCurrentPage("login");
  }, []);

  if (!ready) return null;

  // Pages that show no sidebar
  const noSidebar = !authed || currentPage === "welcome" || currentPage === "login" || currentPage === "complete" || currentPage === "chat";
  const showSidebar = !noSidebar;

  return (
    <div className="flex min-h-screen">
      {showSidebar && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onCollapsedChange={handleCollapsedChange}
          onLogout={handleLogout}
        />
      )}

      <main
        className="flex-1 overflow-y-auto transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: showSidebar ? (sidebarCollapsed ? "64px" : "220px") : 0 }}
      >
        <div key={currentPage} className="animate-[fade-in_0.2s_ease-out]">
          {currentPage === "welcome" && (
            <LandingScreen
              onGetStarted={handleGetStarted}
              onSignIn={authed ? undefined : handleSignIn}
            />
          )}
          {currentPage === "login" && (
            <LoginScreen
              onLogin={handleLogin}
              onBack={() => setCurrentPage("welcome")}
            />
          )}
          {currentPage === "complete" && (
            <CompleteScreen
              provider={lastDeployInfo.provider}
              model={lastDeployInfo.model}
              onStartChat={() => setCurrentPage("dashboard")}
            />
          )}
          {currentPage === "dashboard" && <Dashboard onNavigate={handleNavigate} />}
          {currentPage === "provision" && <ProvisionWizard onNavigate={handleNavigate} />}
          {currentPage === "settings" && <Settings onNavigate={handleNavigate} />}
          {currentPage === "chat" && (
            <ChatPanel openwebuiUrl={chatUrl} onClose={() => handleNavigate("dashboard")} />
          )}
        </div>
      </main>
    </div>
  );
}
