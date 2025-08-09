import { config } from 'dotenv';
import { mockMetricsService, mockCreateLogger } from './helpers/mockHelpers';

// 테스트 환경 설정
config({ path: '.env.test' });

// Mock logger service at global level
jest.mock('../src/services/logger', () => ({
  createLogger: mockCreateLogger,
  LoggerService: jest.fn().mockImplementation(() => mockCreateLogger()),
  globalLogger: mockCreateLogger()
}));

// Mock metrics service at global level
jest.mock('../src/services/metrics', () => ({
  metricsService: mockMetricsService,
  MetricsService: jest.fn().mockImplementation(() => mockMetricsService)
}));

// Mock config to provide required environment variables
jest.mock('../src/config', () => ({
  appConfig: {
    OPENAI_API_KEY: 'test',
    QDRANT_API_KEY: 'test',
    QDRANT_URL: 'http://localhost',
    COLLECTION_NAME: 'test',
    FIRESTORE_PROJECT_ID: 'test',
    GITHUB_WEBHOOK_SECRET: 'secret',
    TELEGRAM_BOT_TOKEN: 'token'
  }
}));

// 전역 테스트 설정
beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  // 테스트 중 console.log 최소화
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // 테스트 완료 후 정리
  jest.clearAllTimers();
});

beforeEach(() => {
  // 각 테스트 전에 mocks 초기화
  jest.clearAllMocks();
  jest.clearAllTimers();
});

afterEach(() => {
  // 각 테스트 후에 mocks 정리
  jest.restoreAllMocks();
});