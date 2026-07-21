import type { CloudProvider, ProviderName } from "./types";
import { kamateraAdapter } from "./kamatera/adapter.server";
import { vultrAdapter } from "./vultr/adapter.server";
import { contaboAdapter } from "./contabo/adapter.server";

const REGISTRY: Partial<Record<ProviderName, CloudProvider>> = {
  vultr: vultrAdapter,
  kamatera: kamateraAdapter,
  contabo: contaboAdapter,
};

export function listProviders(): {
  name: ProviderName;
  displayName: string;
  enabled: boolean;
  recommended?: boolean;
  note?: string;
}[] {
  // Only expose providers that are actually wired.
  return (Object.keys(REGISTRY) as ProviderName[]).map((n) => ({
    name: n,
    displayName: displayNameFor(n),
    enabled: true,
    recommended: n === "vultr",
    note: n === "vultr"
      ? "Recommended — fixed plans, simple API, great for reselling"
      : n === "kamatera"
      ? "Custom sizing — requires IP allowlist & manual validation"
      : n === "contabo"
      ? "Budget VPS — requires OAuth2 credentials"
      : undefined,
  }));
}

export function getProvider(name: ProviderName): CloudProvider {
  const p = REGISTRY[name];
  if (!p) throw new Error(`Provider not configured: ${name}`);
  return p;
}

export function getRecommendedProvider(): ProviderName {
  return "vultr";
}

function displayNameFor(n: ProviderName) {
  return {
    kamatera: "Kamatera",
    vultr: "Vultr",
    contabo: "Contabo",
    hetzner: "Hetzner Cloud",
    digitalocean: "DigitalOcean",
    aws: "Amazon Web Services",
    azure: "Microsoft Azure",
    gcp: "Google Cloud Platform",
  }[n];
}
