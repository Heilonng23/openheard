import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { to: string; subject: string; html: string; text: string }[]);
vi.mock("@openheard/env/server", () => ({
  env: { EMAIL: { send: vi.fn(async (msg: (typeof sent)[number]) => (sent.push(msg), { messageId: "m1" })) } },
}));

import { sendInviteEmail } from "./email";

describe("sendInviteEmail", () => {
  beforeEach(() => void (sent.length = 0));

  it("escapes the workspace and inviter names in the HTML, not the plain text", async () => {
    await sendInviteEmail("a@example.com", "Eve <script>x</script>", "Acme <b>Co</b>", "https://example.com/join/t");
    const [msg] = sent;
    expect(msg.html).toContain("Acme &lt;b&gt;Co&lt;/b&gt;");
    expect(msg.html).toContain("Eve &lt;script&gt;x&lt;/script&gt;");
    expect(msg.html).not.toContain("<b>Co</b>");
    expect(msg.html).not.toContain("<script>");
    expect(msg.text).toContain("Acme <b>Co</b>");
  });
});
