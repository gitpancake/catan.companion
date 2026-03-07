import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { saveAuth, clearAuth, type StoredUser } from "@/lib/storage";
import LoginScreen from "./LoginScreen";
import LeagueView from "./LeagueView";
import SubmitGameView from "./SubmitGameView";

export default function App() {
  const [status, setStatus] = useState<"loading" | "locked" | "unlocked">("loading");
  const [user, setUser] = useState<StoredUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<"leagues" | "submit">("leagues");

  useEffect(() => {
    // Wait for Firebase auth to initialize — this fires once on load and on login/logout
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (fbUser) => {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        const storedUser: StoredUser = {
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        };
        await saveAuth(token, storedUser);
        setToken(token);
        setUser(storedUser);
        setStatus("unlocked");
      } else {
        // No Firebase session — can't get a valid token, so require login
        await clearAuth();
        setStatus("locked");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(getFirebaseAuth());
    await clearAuth();
    setUser(null);
    setStatus("locked");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (status === "locked" || !user) {
    return <LoginScreen />;
  }

  if (view === "submit") {
    return (
      <SubmitGameView
        token={token}
        onBack={() => setView("leagues")}
      />
    );
  }

  return (
    <LeagueView
      user={user}
      token={token}
      onLogout={handleLogout}
      onSubmitGame={() => setView("submit")}
    />
  );
}
