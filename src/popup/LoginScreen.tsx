import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch {
      setError("Invalid credentials");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <h1 className="text-sm font-bold tracking-tight">catan.</h1>
          <p className="text-xs text-muted-foreground">
            Sign in to Catan Companion
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {resetSent && (
            <p className="text-xs text-positive">Password reset email sent</p>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={async () => {
              if (!email) {
                setError("Enter your email first");
                return;
              }
              setError("");
              setResetSent(false);
              try {
                await sendPasswordResetEmail(getFirebaseAuth(), email);
                setResetSent(true);
              } catch {
                setError("Failed to send reset email");
              }
            }}
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}
