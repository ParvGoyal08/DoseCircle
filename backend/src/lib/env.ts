export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get tableName() {
    return requireEnv("TABLE_NAME");
  },
  get stateMachineArn() {
    return requireEnv("STATE_MACHINE_ARN");
  },
  /** SSM parameter path prefix, e.g. "/dosecircle". */
  get ssmPrefix() {
    return requireEnv("SSM_PREFIX");
  },
  /** Public app origin used in notification links, e.g. "https://main.xxxx.amplifyapp.com". */
  get appOrigin() {
    return requireEnv("APP_ORIGIN");
  },
};
