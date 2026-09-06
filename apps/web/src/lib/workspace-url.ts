// Absolute URL for a workspace. In the cloud every workspace is a subdomain of
// ROOT_DOMAIN; on a self-hosted install there is only "default" at the origin.
export function workspaceUrl(slug: string, rootDomain: string | null, path = "/") {
  if (typeof window === "undefined") return path;
  const { protocol, port } = window.location;
  if (!rootDomain || slug === "default") return path;
  return `${protocol}//${slug}.${rootDomain}${port ? ":" + port : ""}${path}`;
}
