import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_HOURS } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support | Timelly",
  description: "How to get help with Timelly.",
};

export default function SupportPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 text-zinc-800 shadow-2xl">
        <h1 className="text-3xl font-bold text-zinc-950">Support</h1>
        <p className="mt-3 text-sm leading-relaxed">
          Need help with login, fees, attendance or anything else in Timelly? Contact us and
          include your school name, your role, and a screenshot if you can.
        </p>
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-950">Email</dt>
            <dd>
              <a className="text-violet-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-950">Hours</dt>
            <dd>{SUPPORT_HOURS}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-950">Something not loading?</dt>
            <dd>
              Check the{" "}
              <Link className="text-violet-700 underline" href="/status">
                status page
              </Link>{" "}
              first.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-950">Privacy requests</dt>
            <dd>
              See the{" "}
              <Link className="text-violet-700 underline" href="/privacy-policy">
                Privacy Policy
              </Link>
              .
            </dd>
          </div>
        </dl>
      </article>
    </main>
  );
}
