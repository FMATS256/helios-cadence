export function welcomeDetails(customer: { company_name: string; account_number: string }, manager: { full_name: string; email: string }, services: string[] = [], login?: { username: string; password: string; email: string; url: string } | null) {
  if (!/^[a-z0-9._%+-]+@imtsolutions\.co\.zw$/i.test(manager.email)) throw new Error("Account manager needs an IMT email address");
  const serviceNames = [...new Set(services.filter(Boolean))];
  const body = [
    `Dear ${customer.company_name},`,
    `Welcome to IMT Solutions. Your account number is ${customer.account_number}.`,
    `I'm ${manager.full_name}, your dedicated account manager — simply reply to this email whenever you need assistance.`,
    ...(serviceNames.length ? [`Your services: ${serviceNames.join(", ")}.`] : []),
    ...(login ? [`Your client portal login (${login.url}):\nUsername: ${login.username}\nTemporary password: ${login.password}\nYou can also sign in with your email or account number. Please change this password after your first sign-in.`] : []),
    "Kind regards,",
  ].join("\n\n");
  return { subject: `Welcome to IMT Solutions — Account ${customer.account_number}`, body, from: manager.email, name: manager.full_name };
}