import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy" },
      { property: "og:title", content: "Privacy Policy" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 md:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective September 9, 2026</p>

      <div className="prose-policy mt-10 flex flex-col gap-8 text-[15px] leading-[1.7] text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <section>
          <h2>Who we are</h2>
          <p>
            openheard is a hosted feedback board service operated by openheard. You can reach us at hello@openheard.com.
          </p>
        </section>

        <section>
          <h2>What we collect</h2>
          <ul>
            <li><strong>Account information</strong> — your email address, display name, and optionally your Google profile image when you sign in with Google.</li>
            <li><strong>Content you create</strong> — posts, votes, comments, and workspace settings.</li>
            <li><strong>Technical data</strong> — IP address and user agent string, recorded in server logs.</li>
            <li><strong>Cookies</strong> — a session cookie to keep you signed in. No advertising or tracking cookies.</li>
          </ul>
        </section>

        <section>
          <h2>How we use it</h2>
          <p>
            We use your data to operate the service: authenticate you, display your posts and votes, send notifications you opted into, and diagnose errors. We do not sell your data. We do not show ads. We do not profile you for marketing.
          </p>
        </section>

        <section>
          <h2>Where it lives</h2>
          <p>
            Your data is stored on Cloudflare infrastructure in the US West region. Backups and replicas stay within Cloudflare's network.
          </p>
        </section>

        <section>
          <h2>Subprocessors</h2>
          <ul>
            <li><strong>Cloudflare</strong> — hosting, edge compute (Workers), database (D1), file storage (R2), and transactional email.</li>
            <li><strong>Google</strong> — OAuth sign-in only. We receive your email, name, and profile image; Google does not receive your openheard activity.</li>
          </ul>
        </section>

        <section>
          <h2>Retention</h2>
          <p>
            Account data and content are kept for as long as your account exists. Server logs with IP addresses are retained for 30 days, then deleted. If you delete your account, your personal data is removed within 30 days; posts you authored are anonymised.
          </p>
        </section>

        <section>
          <h2>Deletion</h2>
          <p>
            You can request deletion of your account and associated data at any time by emailing hello@openheard.com. We will process your request within 30 days.
          </p>
        </section>

        <section>
          <h2>GDPR</h2>
          <p>
            If you are in the European Economic Area, the United Kingdom, or Switzerland:
          </p>
          <ul>
            <li><strong>Lawful basis</strong> — we process account and content data under legitimate interest (operating the service you signed up for) and session cookies under the same basis. We process your email for notifications only with your consent.</li>
            <li><strong>Your rights</strong> — you may access, correct, export, or delete your personal data, restrict or object to processing, and withdraw consent for optional processing. Email hello@openheard.com to exercise any right.</li>
            <li><strong>Data controller</strong> — openheard, reachable at hello@openheard.com.</li>
          </ul>
        </section>

        <section>
          <h2>Children</h2>
          <p>
            openheard is not directed at anyone under 16. If we learn that a child under 16 has provided personal data, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            We may update this policy and will post the revised version here with a new effective date. Material changes will be communicated via email to account holders.
          </p>
        </section>
      </div>
    </main>
  );
}
