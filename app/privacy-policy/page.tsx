import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Timelly",
  description:
    "How Timelly collects, uses, and shares personal information for the school management app at app.timely.in.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "7 October 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white text-zinc-800 shadow-2xl">
        <header className="border-b border-zinc-200 px-6 py-8 sm:px-10">
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192.png"
              alt="Timelly"
              width={48}
              height={48}
              className="h-12 w-12 rounded-xl"
            />
            <div>
              <p className="text-sm font-semibold text-zinc-500">Timelly</p>
              <p className="text-xs text-zinc-400">app.timely.in</p>
            </div>
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-950">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            This policy explains how Timelly (&quot;we&quot;, &quot;us&quot;) handles personal
            information when you use the Timelly school management app and website at{" "}
            <a
              href="https://app.timely.in"
              className="font-medium text-violet-700 underline underline-offset-2"
            >
              https://app.timely.in
            </a>
            , including the Android app published on Google Play. It applies to parents,
            students, teachers, and school staff who use Timelly.
          </p>
        </header>

        <div className="space-y-8 px-6 py-8 text-sm leading-relaxed sm:px-10">
          <Section title="1. Who this policy is for">
            <p>
              Timelly is school management software. Schools use it to run admissions,
              attendance, academics, fees, communication, and related administration.
              Accounts are created by a school. We do not offer a public sign-up for
              the general public, and we do not show third-party advertising.
            </p>
            <p>
              Student records may include information about children. Schools and
              parents provide that information so the school can operate. We process
              it to provide the service to the school. We do not sell personal
              information, and we do not use student information for advertising or
              marketing profiles.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <p>Depending on your role and what your school records, we may store:</p>
            <ul>
              <li>
                <strong>Account details:</strong> name, login identifier (such as an
                admission number or email), hashed password, role, mobile number, and
                school.
              </li>
              <li>
                <strong>Student and parent details:</strong> student name, class and
                section, roll number, date of birth, gender, address, phone number,
                father&apos;s and mother&apos;s names, parent occupation, previous
                school, and day-scholar or residential status.
              </li>
              <li>
                <strong>Government or school identifiers,</strong> when the school
                enters them: Aadhaar number, PEN, APAAR ID, and admission number.
              </li>
              <li>
                <strong>Academic and school records:</strong> attendance, marks and
                grades, homework, timetable, events, leave requests, certificates,
                transfer certificates, and messages sent inside the app.
              </li>
              <li>
                <strong>Staff details:</strong> teacher or admin name, contact
                details, photo, subjects, qualification, experience, joining date, and
                address.
              </li>
              <li>
                <strong>Fee and payment details:</strong> fee structure, amounts due
                and paid, discounts, receipts, and payment status. Online payments are
                processed by our payment partner (HyperPG / Juspay). We receive
                transaction status and references. We do not store full card numbers,
                UPI PINs, or net-banking passwords.
              </li>
              <li>
                <strong>Files you upload:</strong> profile photos, logos, and
                certificate or document files. These are stored with our file-storage
                provider (Supabase).
              </li>
              <li>
                <strong>App usage needed to run the service:</strong> in-app
                notifications, and a login session stored in a cookie. The app may
                remember recent logins and display preferences on your device. We do
                not collect your device location, contacts, SMS, microphone, or camera
                in the background, and we do not use advertising or analytics SDKs.
              </li>
            </ul>
          </Section>

          <Section title="3. How we use information">
            <p>We use this information to:</p>
            <ul>
              <li>Create and secure accounts and show each person the right school portal.</li>
              <li>
                Let schools record and view attendance, marks, homework, fees, leaves,
                events, and certificates.
              </li>
              <li>Send in-app notices about school activity, such as homework or fees.</li>
              <li>Process fee and subscription payments and issue receipts.</li>
              <li>Send operational email, such as fee backup reports requested by a school.</li>
              <li>Keep the service reliable, investigate misuse, and fix errors.</li>
            </ul>
            <p>
              We do not sell personal information. We do not use it to serve ads.
            </p>
          </Section>

          <Section title="4. Who we share information with">
            <ul>
              <li>
                <strong>Your school.</strong> School administrators, authorised
                teachers, and, where the product allows it, parents can see the
                records that belong to their school and role. The school decides who
                on its staff may access student data.
              </li>
              <li>
                <strong>Payment processing.</strong> When you pay fees online, payment
                details needed to complete the transaction are shared with HyperPG /
                Juspay and the banks or UPI apps you choose at checkout.
              </li>
              <li>
                <strong>File storage.</strong> Uploaded photos and documents are stored
                using Supabase.
              </li>
              <li>
                <strong>Email delivery.</strong> Operational emails are sent through
                the mail service configured for the school.
              </li>
              <li>
                <strong>Legal requirements.</strong> We may disclose information if
                the law, a court, or a government authority requires it, or to protect
                the rights, safety, and security of users and the service.
              </li>
            </ul>
            <p>
              Schools may be located in India. Our service providers may process data
              on servers outside your state. We share only what is needed to run
              Timelly.
            </p>
          </Section>

          <Section title="5. Children">
            <p>
              Timelly is used by schools. Some accounts and records belong to
              students who are children. A school creates those accounts and enters
              student information. Children are not asked to create a public account
              on their own.
            </p>
            <p>
              We do not knowingly use children&apos;s information for advertising, and
              we do not sell it. Parents and guardians should contact the school to
              review, correct, or ask for deletion of a student&apos;s information.
              The school can update or remove records in Timelly, or ask us to help.
            </p>
          </Section>

          <Section title="6. How long we keep information">
            <p>
              We keep school and student records for as long as the school uses
              Timelly and as needed for fee receipts, academic history, and legal
              duties. If a school closes its account or asks us to delete data, we
              delete or de-identify it unless we must keep specific records (for
              example payment receipts) for accounting or legal reasons.
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              Passwords are stored in hashed form. Access to portals is limited by
              role. Online payments are handled by the payment provider, not by
              storing card details in Timelly. No method of transmission or storage
              is completely secure. Schools should give access only to staff who need
              it and should keep login details private.
            </p>
          </Section>

          <Section title="8. Your choices">
            <ul>
              <li>
                You can ask your school administrator to correct student, parent, or
                staff details shown in the app.
              </li>
              <li>
                You can ask the school, or us, to delete an account when it is no
                longer needed. Some fee and academic records may be retained where
                the law or the school&apos;s records require it.
              </li>
              <li>
                You can sign out to end your session. Recent logins stored on the
                device can be cleared from the device browser or app storage.
              </li>
            </ul>
            <p>
              If you are a parent, contact the school first. The school controls the
              student record. You may also write to us using the contact below and we
              will work with the school.
            </p>
          </Section>

          <Section title="9. Changes">
            <p>
              If we change this policy, we will post the new version at{" "}
              <Link href="/privacy-policy" className="font-medium text-violet-700 underline underline-offset-2">
                https://app.timely.in/privacy-policy
              </Link>{" "}
              and update the date at the top. Continued use of Timelly after the
              update means the revised policy applies.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about this policy or a request to access, correct, or delete
              personal information:
            </p>
            <p>
              Timelly
              <br />
              Email:{" "}
              <a
                href="mailto:timelly26@gmail.com"
                className="font-medium text-violet-700 underline underline-offset-2"
              >
                timelly26@gmail.com
              </a>
              <br />
              Website:{" "}
              <a
                href="https://app.timely.in"
                className="font-medium text-violet-700 underline underline-offset-2"
              >
                https://app.timely.in
              </a>
            </p>
          </Section>
        </div>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-2 space-y-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
