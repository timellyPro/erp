import type { StudentCredentialRow } from "./types";

/** Text for a password that cannot be shown, by the reason it cannot be shown. */
export function passwordUnavailableLabel(row: Pick<StudentCredentialRow, "passwordState">): string {
  switch (row.passwordState) {
    case "NO_LOGIN":
      return "No login yet. Reset to create one";
    case "NO_DOB":
      return "No date of birth. Add it first";
    case "CUSTOM":
    default:
      return "Password was changed. Reset to show it";
  }
}
