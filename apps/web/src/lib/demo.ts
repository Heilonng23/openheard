// The public demo workspace. Anyone can open its dashboard as an admin, so
// everything that leaks data, spends money or outlives the night is closed off.
// Keep this file free of server imports: the UI reads it too.
export const DEMO_WORKSPACE_ID = "demo";
export const DEMO_ADMIN_ID = "demo-admin";
export const DEMO_ADMIN_EMAIL = "admin@demo.invalid";

export const isDemo = (workspace: { id: string } | null | undefined) => workspace?.id === DEMO_WORKSPACE_ID;

// Settings that are hidden in the demo, matched against the slugs in
// lib/admin-nav.ts. Billing is somebody's real card; the rest either shows
// member emails or hands out credentials that outlive the nightly reset.
export const DEMO_HIDDEN_SETTINGS = ["billing", "team", "access", "api-keys", "export"] as const;

export function assertNotDemo(workspace: { id: string }) {
  if (isDemo(workspace)) throw new Error("Not available in the demo workspace");
}

// The demo login is shared, so it is an identity anyone can assume. Guard on
// the account as well as the workspace: a workspace check alone still lets the
// account act on the apex host, where the workspace resolves to default.
export const isDemoIdentity = (user: { id: string } | null | undefined) => user?.id === DEMO_ADMIN_ID;

export function assertNotDemoIdentity(user: { id: string } | null | undefined) {
  if (isDemoIdentity(user)) throw new Error("Not available for the demo account");
}
