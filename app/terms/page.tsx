import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms of Service | Timelly",
  description: "The terms that govern use of the Timelly school management app at app.timelly.in.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "13 October 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white text-zinc-800 shadow-2xl">
        <header className="border-b border-zinc-200 px-6 py-8 sm:px-10">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950">Terms of Service</h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            These terms govern use of Timelly (&quot;we&quot;, &quot;us&quot;), the school management service at{" "}
            <a href="https://app.timelly.in" className="font-medium text-violet-700 underline underline-offset-2">
              https://app.timelly.in
            </a>
            . By using the service you agree to them.
          </p>
        </header>
        <div className="space-y-8 px-6 py-8 text-sm leading-relaxed text-zinc-700 sm:px-10">
          <Section title="1. Who the service is for">
            <p>
              Timelly is provided to schools (&quot;School&quot;) and to the staff, parents and students the School
              authorises. The School is responsible for the accuracy of the data it enters and for deciding who
              receives an account.
            </p>
          </Section>
          <Section title="2. Accounts">
            <ul>
              <li>Keep your login credentials confidential and do not share your account.</li>
              <li>You are responsible for activity under your account. Tell us promptly if you suspect misuse.</li>
              <li>We may suspend an account that is used abusively, insecurely or against these terms.</li>
            </ul>
          </Section>
          <Section title="3. Acceptable use">
            <p>You must not attempt to access another school&apos;s data, probe or disrupt the service, upload unlawful or harmful content, or reverse engineer the service.</p>
          </Section>
          <Section title="4. School data and privacy">
            <p>
              The School owns its data. We process it only to provide the service, as described in our{" "}
              <Link href="/privacy-policy" className="font-medium text-violet-700 underline underline-offset-2">
                Privacy Policy
              </Link>
              . The School is responsible for obtaining any parental consent required by law for students under 18.
              On request, we will export or delete a School&apos;s data subject to applicable legal retention duties.
            </p>
          </Section>
          <Section title="5. Fees and payments">
            <p>
              Plan fees, trial periods and billing terms are agreed with the School. Fee payments made by parents to
              a School are processed through a third-party payment gateway; we do not store card details. We may
              suspend a School&apos;s access for non-payment after notice.
            </p>
          </Section>
          <Section title="6. Availability and changes">
            <p>
              We aim for high availability but do not guarantee uninterrupted service. We may update or discontinue
              features, and will give reasonable notice of material changes.
            </p>
          </Section>
          <Section title="7. Liability">
            <p>
              To the extent permitted by law, the service is provided &quot;as is&quot; and our total liability is
              limited to the fees paid by the School in the preceding 12 months. Nothing limits liability that cannot
              be limited by law.
            </p>
          </Section>
          <Section title="8. Governing law">
            <p>These terms are governed by the laws of India. Courts at the location of our registered office have jurisdiction.</p>
          </Section>
          <Section title="9. Contact">
            <p>
              Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-violet-700 underline underline-offset-2">{SUPPORT_EMAIL}</a>
            </p>
          </Section>
        </div>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-2 space-y-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>
    </section>
  );
}
