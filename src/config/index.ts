import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  
  // Qdrant Configuration
  QDRANT_API_KEY: z.string().min(1, 'Qdrant API key is required'),
  QDRANT_URL: z.string().url('Qdrant URL must be a valid URL'),
  COLLECTION_NAME: z.string().default('knue_policy_hub_v1'),
  
  // Firestore Configuration
  FIRESTORE_PROJECT_ID: z.string().min(1, 'Firestore project ID is required'),
  
  // GitHub Configuration
  REPO_ID: z.string().default('kadragon/KNUE-Policy-Hub'),
  DEFAULT_BRANCH: z.string().default('main'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GitHub webhook secret is required'),
  
  // Telegram Configuration
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
  
  // Application Configuration
  LANG_DEFAULT: z.enum(['ko', 'en']).default('ko'),
  MIN_INSTANCES: z.string().transform(Number).default('1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('8080'),
  
  // Google Cloud Configuration
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
});

type Config = z.infer<typeof envSchema>;

const parseConfig = (): Config => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n');
      throw new Error(`Environment validation failed:\n${missingVars}`);
    }
    throw error;
  }
};

export const appConfig = parseConfig();

export const isDevelopment = appConfig.NODE_ENV === 'development';
export const isProduction = appConfig.NODE_ENV === 'production';
export const isTest = appConfig.NODE_ENV === 'test';

export default appConfig;