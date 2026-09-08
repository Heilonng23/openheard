import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service" },
      { property: "og:title", content: "Terms of Service" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 md:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective September 9, 2026</p>

      <div className="prose-policy mt-10 flex flex-col gap-8 text-[15px] leading-[1.7] text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <section>
          <h2>The service</h2>
          <p>
            openheard is a hosted feedback board that lets your users post ideas, vote, and follow progress. It is operated by openheard ("openheard", "we", "us"). By creating an account or using the service you agree to these terms.
          </p>
        </section>

        <section>
          <h2>Your account</h2>
          <p>
            You are responsible for keeping your login credentials secure. One person or legal entity per account. Automated sign-ups are not allowed.
          </p>
        </section>

        <section>
          <h2>Your data</h2>
          <p>
            You own the content you and your users post. We claim no intellectual property rights over it. You grant us a licence to host, display, and transmit your content solely to operate the service. If you leave, you can export your data as CSV at any time.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the service for anything unlawful or to collect data about others without consent.</li>
            <li>Upload malware, spam, or content that infringes someone else's rights.</li>
            <li>Attempt to access accounts, data, or systems that are not yours.</li>
            <li>Interfere with the service's operation or circumvent rate limits or access controls.</li>
          </ul>
        </section>

        <section>
          <h2>Suspension and termination</h2>
          <p>
            We may suspend or terminate your account if you violate these terms or if your use poses a risk to other users or the service. Where possible we will give you notice and a chance to export your data before termination. You can close your account at any time by emailing hello@openheard.com.
          </p>
        </section>

        <section>
          <h2>Plans and pricing</h2>
          <p>
            openheard offers a free tier and paid plans. Prices, features, and limits may change. We will give at least 30 days' notice before a price increase takes effect on your account. If you do not accept the new price you may cancel before it applies.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            We aim for high uptime but do not guarantee uninterrupted service. Scheduled maintenance will be announced in advance when possible.
          </p>
        </section>

        <section>
          <h2>Disclaimer of warranties</h2>
          <p>
            The service is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section>
          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, openheard is not liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill. Our total liability for any claim related to the service is limited to the amount you paid us in the 12 months before the claim arose, or $50, whichever is greater.
          </p>
        </section>

        <section>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the United Arab Emirates. Any dispute will be resolved in the courts of the United Arab Emirates.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            We may update these terms and will post the revised version here with a new effective date. Material changes will be communicated via email at least 30 days before they take effect. Continued use after the effective date constitutes acceptance.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about these terms? Email hello@openheard.com.
          </p>
        </section>
      </div>
    </main>
  );
}
