export function getEnv() {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    // Add other environment variables your app needs
  };
}

export type Env = ReturnType<typeof getEnv>;