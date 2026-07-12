import type { CloudProvider, ProviderName } from "./types";
import { kamateraAdapter } from "./kamatera/adapter.server";

const REGISTRY: Partial<Record<ProviderName, CloudProvider>> = {
  kamatera: kamateraAdapter,
};

export function listProviders(): { name: ProviderName; displayName: string; enabled: boolean }[] {
  const all: ProviderName[] = ["kamatera", "hetzner", "digitalocean", "vultr", "aws", "azure", "gcp"];
  return all.map((n) => ({
    name: n,
    displayName: displayNameFor(n),
    enabled: !!REGISTRY[n],
  }));
}

export function getProvider(name: ProviderName): CloudProvider {
  const p = REGISTRY[name];
  if (!p) throw new Error(`Provider not configured: ${name}`);
  return p;
}

function displayNameFor(n: ProviderName) {
  return {
    kamatera: "Kamatera",
    hetzner: "Hetzner Cloud",
    digitalocean: "DigitalOcean",
    vultr: "Vultr",
    aws: "Amazon Web Services",
    azure: "Microsoft Azure",
    gcp: "Google Cloud Platform",
  }[n];
}
