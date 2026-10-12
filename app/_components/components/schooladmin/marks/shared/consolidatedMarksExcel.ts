import { examFileLabel, sheetNameSafe, type ConsolidatedPayload } from "./downloadReportsTypes";

export async function generateConsolidatedMarksExcel(
  data: ConsolidatedPayload,
  examTypes: string[],
  selectMode: "class" | "section"
) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Timelly";
  const usedNames = new Set<string>();

  const schoolName = data.school?.name ?? "School";

  for (const sheet of data.sheets ?? []) {
    const examLabel =
      sheet.examType && sheet.examType !== "ALL" ? sheet.examType : "ALL EXAMS";
    const sheetTitle =
      examTypes.length > 1 && sheet.examType && sheet.examType !== "ALL"
        ? `${sheet.examType} ${sheet.label}`
        : sheet.label;
    const ws = workbook.addWorksheet(sheetNameSafe(sheetTitle, usedNames));
    const subjects = sheet.subjects ?? [];
    const showSection = Boolean(sheet.includeSectionCol);
    const colCount = 2 + (showSection ? 1 : 0) + subjects.length + 4;

    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = schoolName.toUpperCase();
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = `CONSOLIDATED MARKS LIST — ${examLabel}        CLASS: ${sheet.label}`;
    subCell.font = { bold: true, size: 11 };
    subCell.alignment = { horizontal: "center", vertical: "middle" };

    const headers = [
      "S.NO",
      "NAME OF THE STUDENT",
      ...(showSection ? ["SECTION"] : []),
      ...subjects,
      "TOTAL",
      "PERCENTAGE",
      "GRADE",
      "RANK",
    ];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8F5C8" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    sheet.students.forEach((stu, idx) => {
      const rowVals: (string | number | null)[] = [
        idx + 1,
        stu.name,
        ...(showSection ? [stu.section ?? ""] : []),
        ...subjects.map((sub) => {
          const v = stu.subjectMarks?.[sub];
          if (v === "AB") return "AB";
          if (v === null || v === undefined) return "";
          return v;
        }),
        stu.totalMax > 0 ? stu.totalObtained : "",
        stu.totalMax > 0 ? stu.percentage : "",
        stu.totalMax > 0 ? stu.grade : "",
        stu.totalMax > 0 ? stu.rank : "",
      ];
      const row = ws.addRow(rowVals);
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = {
          horizontal: colNumber === 2 ? "left" : "center",
          vertical: "middle",
        };
      });
    });

    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 28;
    let col = 3;
    if (showSection) {
      ws.getColumn(col).width = 10;
      col++;
    }
    for (let i = 0; i < subjects.length; i++) ws.getColumn(col + i).width = 12;
    col += subjects.length;
    ws.getColumn(col).width = 10;
    ws.getColumn(col + 1).width = 12;
    ws.getColumn(col + 2).width = 10;
    ws.getColumn(col + 3).width = 8;
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 20;
  }

  if ((data.sheets ?? []).length === 0) {
    throw new Error("No class sheets to export");
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const examFile = examFileLabel(examTypes);
  const modeFile = selectMode === "class" ? "BY_CLASS" : "BY_SECTION";
  a.href = url;
  a.download = `${examFile}_CONSOLIDATED_${modeFile}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
