/**
 * Admission fees recorded in the Admissions module (StudentApplication.admissionFee / admissionFeePaid).
 * They are not part of the student's fee records, so the due reports do not see them; the Revenue Template adds them.
 * Pass the tenant-scoped client (or the plain one in scripts). Always filtered by schoolId.
 */
export type AdmissionFeeAmounts = { fee: number; paid: number };

type ApplicationFinder = {
  studentApplication: {
    findMany: (args: {
      where: { schoolId: string; studentId: { in: string[] }; admissionFee: { gt: number } };
      select: { studentId: true; admissionFee: true; admissionFeePaid: true };
    }) => Promise<Array<{ studentId: string | null; admissionFee: number | null; admissionFeePaid: boolean }>>;
  };
};

export async function loadAdmissionFeesByStudent(
  db: ApplicationFinder,
  schoolId: string,
  studentIds: string[]
): Promise<Map<string, AdmissionFeeAmounts>> {
  const out = new Map<string, AdmissionFeeAmounts>();
  for (let i = 0; i < studentIds.length; i += 1000) {
    const rows = await db.studentApplication.findMany({
      where: { schoolId, studentId: { in: studentIds.slice(i, i + 1000) }, admissionFee: { gt: 0 } },
      select: { studentId: true, admissionFee: true, admissionFeePaid: true },
    });
    for (const r of rows) {
      if (!r.studentId) continue;
      const fee = Number(r.admissionFee) || 0;
      const prev = out.get(r.studentId) ?? { fee: 0, paid: 0 };
      out.set(r.studentId, { fee: prev.fee + fee, paid: prev.paid + (r.admissionFeePaid ? fee : 0) });
    }
  }
  return out;
}
