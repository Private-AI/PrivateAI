const SESSION_KEY = "privateai_session";

interface User {
  id: string;
  email: string;
  name: string;
  ph: string; // password hash
}

function ph(password: string): string {
  try {
    return btoa(password.split("").reverse().join("") + ":privateai");
  } catch {
    return password;
  }
}

const USERS: User[] = [
  {
    id: "demo-user",
    email: "demo@example.com",
    name: "Demo User",
    ph: ph("REDACTED"),
  },
  {
    id: "admin",
    email: "admin@example.com",
    name: "Admin",
    ph: ph("admin"),
  },
];

export interface Session {
  userId: string;
  email: string;
  name: string;
  loginAt: number;
}

const CREDENTIAL_KEYS = [
  "privateai_settings",
  "privateai_saved_credentials",
  "_privateai_chat_url",
];

function clearCredentials(): void {
  try {
    // Remove saved Azure/cloud credentials — never persist across sessions.
    const raw = localStorage.getItem("privateai_settings");
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings?.savedCredentials) {
        settings.savedCredentials = null;
        localStorage.setItem("privateai_settings", JSON.stringify(settings));
      }
    }
    CREDENTIAL_KEYS.forEach((k) => {
      if (k !== "privateai_settings") localStorage.removeItem(k);
    });
  } catch {}
}

export function login(email: string, password: string): Session | null {
  const user = USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase().trim() && u.ph === ph(password),
  );
  if (!user) return null;
  // Clear any credentials left over from a previous session before establishing a new one.
  clearCredentials();
  const session: Session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    loginAt: Date.now(),
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  return session;
}

export function logout(): void {
  // Clear credentials on sign-out so the next user never sees them.
  clearCredentials();
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch { return null; }
}
