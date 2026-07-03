import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCustomers from "./tools/list-customers";
import getCustomer from "./tools/get-customer";
import listTickets from "./tools/list-tickets";
import createTicket from "./tools/create-ticket";
import listCredentials from "./tools/list-credentials";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "imt-ops-mcp",
  title: "IMT Operations Platform",
  version: "0.1.0",
  instructions:
    "Tools for the IMT Operations Platform. Every customer has an immutable M-number (e.g. M0001). Use list_customers/get_customer to look them up, list_tickets/create_ticket for support work, and list_credentials for vault metadata (secret values are never exposed via MCP).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCustomers, getCustomer, listTickets, createTicket, listCredentials],
});
