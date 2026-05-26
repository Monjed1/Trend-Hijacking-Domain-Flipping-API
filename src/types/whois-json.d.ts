declare module "whois-json" {
  const whois: (domain: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  export default whois;
}
