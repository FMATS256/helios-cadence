export type LoginIdentifier = { kind: "email" | "account" | "username"; value: string };

/** Clients may sign in with their email, IMT account number (M10457…) or portal username. */
export function classifyIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim();
  if (!value) throw new Error("Enter your email, username or account number");
  if (value.includes("@")) return { kind: "email", value: value.toLowerCase() };
  if (/^m\d{5,}$/i.test(value)) return { kind: "account", value: value.toUpperCase() };
  return { kind: "username", value: value.toLowerCase() };
}

/** Readable username from the company name, e.g. "UK2Africa Ltd" -> "uk2africa.ltd". */
export function usernameBase(companyName: string, accountNumber: string) {
  const slug = companyName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24).replace(/\.+$/, "");
  return slug.length >= 3 ? slug : accountNumber.toLowerCase();
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
/** 14-character temporary password with upper, lower, digit and symbol. */
export function temporaryPassword(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(12);
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${body.slice(0, 6)}-${body.slice(6)}#7Ka`.slice(0, 14);
}
