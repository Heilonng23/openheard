export const SETTINGS_NAV = [
  { group: "Personal", items: [["profile", "Profile"], ["notifications", "Notifications"]] },
  { group: "Workspace", items: [["general", "General"], ["branding", "Branding"], ["access", "Access"], ["team", "Team"]] },
  { group: "Product", items: [["public-board", "Public board"], ["boards", "Boards & tags"], ["statuses", "Statuses"]] },
  { group: "Developers", items: [["api-keys", "API keys"], ["export", "Import & export"]] },
] as const;
