/**
 * Whose medicines the family member is looking at. Medicines, daily checks and "how it is going"
 * belong to one person, and the navigation reaches them from any screen, so the last person chosen
 * — on the home screen's switcher, or by opening one of their pages — is remembered here.
 */
const KEY = "dosecircle.person";

export function currentPerson(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberPerson(pid: string) {
  try {
    localStorage.setItem(KEY, pid);
  } catch {
    // Without storage the navigation falls back to the home screen for per-person pages.
  }
}
