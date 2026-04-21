"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getDeploymentHistory, getSettings } from "./lib/storage";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import Dashboard from "./dashboard/Dashboard";
import ProvisionWizard from "./provision/ProvisionWizard";
import Settings from "./settings/Settings";

type Page = "welcome" | "dashboard" | "provision" | "settings";

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [isFirstRun, setIsFirstRun] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
      return;
    }
    if (!isLoading && user) {
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
    }
  }, [isLoading, user, router]);

  const handleNavigate = useCallback((page: string): void => {
    setCurrentPage(page as Page);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean): void => {
    setSidebarCollapsed(collapsed);
  }, []);

  if (isLoading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const showSidebar = currentPage !== "welcome";

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
          marginLeft: showSidebar ? (sidebarCollapsed ? "4rem" : "16rem") : 0,
        }}
      >
        <div key={currentPage} className="animate-[fade-in_0.2s_ease-out]">
          {currentPage === "welcome" && (
            <WelcomeScreen onStart={() => setCurrentPage("provision")} />
          )}
          {currentPage === "dashboard" && (
            <Dashboard onNavigate={handleNavigate} />
          )}
          {currentPage === "provision" && (
            <ProvisionWizard onNavigate={handleNavigate} />
          )}
          {currentPage === "settings" && <Settings onNavigate={handleNavigate} />}
        </div>
      </main>
    </div>
  );
}
