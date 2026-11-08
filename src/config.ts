export type AppConfig = {
  port: number;
  swiftfoxBaseUrl: string;
  swiftfoxApiKey: string;
  dynamicsOrgUrl: string;
  dynamicsTenantId: string;
  dynamicsClientId: string;
  dynamicsClientSecret: string;
  dynamicsApiVersion: string;
  webhookSecret: string;
};

function read(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function loadConfig(): AppConfig {
  return {
    port: Number(read("PORT", "8787")) || 8787,
    swiftfoxBaseUrl: read("SWIFTFOX_BASE_URL", "https://api.swiftfoxcrm.com").replace(/\/$/, ""),
    swiftfoxApiKey: read("SWIFTFOX_API_KEY"),
    dynamicsOrgUrl: read("DYNAMICS_ORG_URL").replace(/\/$/, ""),
    dynamicsTenantId: read("DYNAMICS_TENANT_ID"),
    dynamicsClientId: read("DYNAMICS_CLIENT_ID"),
    dynamicsClientSecret: read("DYNAMICS_CLIENT_SECRET"),
    dynamicsApiVersion: read("DYNAMICS_API_VERSION", "v9.2"),
    webhookSecret: read("WEBHOOK_SECRET"),
  };
}

export function connectionStatus(config: AppConfig) {
  const swiftfoxLive = Boolean(config.swiftfoxApiKey);
  const dynamicsLive = Boolean(
    config.dynamicsOrgUrl &&
      config.dynamicsTenantId &&
      config.dynamicsClientId &&
      config.dynamicsClientSecret,
  );
  return {
    swiftfox: {
      mode: swiftfoxLive ? "live" : "sample",
      baseUrl: config.swiftfoxBaseUrl,
      authenticated: swiftfoxLive,
    },
    dynamics: {
      mode: dynamicsLive ? "live" : "sample",
      orgUrl: config.dynamicsOrgUrl || null,
      authenticated: dynamicsLive,
    },
  };
}
