import { crestronConnector } from "./connectors/crestron";
import { crestronWebConnector } from "./connectors/crestron-web";
import { sonanceConnector } from "./connectors/sonance";
import type { ProductSourceConnector } from "./types";

const connectors = [crestronConnector, crestronWebConnector, sonanceConnector] as const;

export function getConnector(slug: string): ProductSourceConnector | undefined {
  return connectors.find((connector) => connector.slug === slug);
}

export function listConnectors(): ProductSourceConnector[] {
  return [...connectors];
}
