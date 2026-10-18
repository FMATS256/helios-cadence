export function welcomeDetails(customer: { company_name: string; account_number: string }, manager: { full_name: string; email: string }, services: string[] = []) {
  if (!/^[a-z0-9._%+-]+@imtsolutions\.co\.zw$/i.test(manager.email)) throw new Error("Account manager needs an IMT email address");
  const serviceNames = [...new Set(services.filter(Boolean))];
  const body = [
    `Dear ${customer.company_name},`,
    `Welcome to IMT Solutions. Your account number is ${customer.account_number}.`,
    `I'm ${manager.full_name}, your dedicated account manager — simply reply to this email whenever you need assistance.`,
    ...(serviceNames.length ? [`Your services: ${serviceNames.join(", ")}.`] : []),
    "Kind regards,",
  ].join("\n\n");
  return { subject: `Welcome to IMT Solutions — Account ${customer.account_number}`, body, from: manager.email, name: manager.full_name };
}