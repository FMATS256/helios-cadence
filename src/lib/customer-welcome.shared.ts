export function welcomeDetails(customer: { company_name: string; account_number: string }, manager: { full_name: string; email: string }, services: string[] = []) {
  if (!/^[a-z0-9._%+-]+@imtsolutions\.co\.zw$/i.test(manager.email)) throw new Error("Account manager needs an IMT email address");
  const serviceNames = [...new Set(services.filter(Boolean))];
  const body = [
    `Dear ${customer.company_name},`,
    "Welcome to IMT Solutions. Thank you for opening your account with us.",
    `Your account number is ${customer.account_number}. Please use this number when contacting us about your account.`,
    `My name is ${manager.full_name}, and I am your dedicated account manager. You can reply directly to this email for assistance with your account and services.`,
    ...(serviceNames.length ? [`Your services: ${serviceNames.join(", ")}.`] : []),
    "I look forward to assisting you.",
  ].join("\n\n");
  return { subject: `Welcome to IMT Solutions — Account ${customer.account_number}`, body, from: manager.email, name: manager.full_name };
}