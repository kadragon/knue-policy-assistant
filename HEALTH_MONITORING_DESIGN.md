# Health Monitoring System Architecture

## 📊 Overview

종합적인 시스템 건강 상태 모니터링을 위한 다층 구조 설계

## 🏗️ Architecture Components

### 1. Health Check Levels

#### **Level 1: Basic Health** ✅ (Already Implemented)
- Service connectivity (Firestore, Qdrant, OpenAI)
- Basic uptime and version info
- Endpoint: `GET /healthz`

#### **Level 2: Detailed Health** 🚧 (To Implement)
- Individual service response times
- LangChain service health
- Memory usage and performance metrics
- Endpoint: `GET /health/detailed`

#### **Level 3: System Metrics** 🚧 (To Implement)
- Conversation memory statistics
- RAG system performance metrics
- GitHub sync job status
- Endpoint: `GET /health/metrics`

#### **Level 4: Deep Diagnostics** 🚧 (To Implement)
- Service-specific diagnostic tests
- End-to-end workflow validation
- Performance benchmarking
- Endpoint: `GET /health/diagnostics`

### 2. Monitoring Categories

#### **🔌 Service Connectivity**
```typescript
interface ServiceHealth {
  firestore: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    lastError?: string;
    collections: {
      conversations: boolean;
      messages: boolean;
      jobs: boolean;
    };
  };
  qdrant: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    collection: {
      exists: boolean;
      vectorCount: number;
      indexedVectors: number;
    };
  };
  openai: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    embedding: {
      available: boolean;
      responseTime: number;
    };
    chat: {
      available: boolean;
      responseTime: number;
    };
  };
  langchain: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    vectorStore: boolean;
    chains: {
      search: boolean;
      conversational: boolean;
      summary: boolean;
    };
  };
}
```

#### **💬 Conversation Memory Health**
```typescript
interface ConversationMetrics {
  activeSessions: number;
  totalMessages: number;
  averageSessionLength: number;
  summaryGeneration: {
    successRate: number;
    averageTime: number;
    failedInLast24h: number;
  };
  memoryUsage: {
    totalTokens: number;
    averageTokensPerSession: number;
    tokenLimitExceeded: number;
  };
}
```

#### **🔍 RAG System Health**
```typescript
interface RAGMetrics {
  searchQueries: {
    total: number;
    successRate: number;
    averageResponseTime: number;
    noEvidenceRate: number;
  };
  documentRetrieval: {
    averageDocuments: number;
    averageScore: number;
    lowScoreQueries: number;
  };
  langchainPerformance: {
    chainExecutionTime: number;
    errorRate: number;
    cacheHitRate?: number;
  };
}
```

#### **⚙️ GitHub Sync Health**
```typescript
interface SyncMetrics {
  recentJobs: {
    completed: number;
    failed: number;
    running: number;
  };
  performance: {
    averageSyncTime: number;
    filesPerSecond: number;
    lastSuccessfulSync: string;
  };
  dataIntegrity: {
    totalFiles: number;
    totalChunks: number;
    orphanedChunks: number;
  };
}
```

### 3. Performance Monitoring

#### **⚡ Response Time Tracking**
- Endpoint response times
- Service call latencies
- LangChain chain execution times
- Database query performance

#### **📈 Throughput Metrics**
- Requests per minute/hour
- Messages processed
- Successful RAG queries
- Sync jobs completed

#### **❌ Error Tracking**
- Error rates by service
- Error categorization
- Recovery success rates
- Alert thresholds

### 4. Structured Logging

#### **📋 Log Categories**
```typescript
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn', 
  INFO = 'info',
  DEBUG = 'debug'
}

interface StructuredLog {
  level: LogLevel;
  timestamp: string;
  service: string;
  operation: string;
  userId?: string;
  chatId?: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}
```

#### **🎯 Key Logging Points**
- All API requests/responses
- Service method calls
- LangChain operations
- Error conditions
- Performance warnings
- User interactions

### 5. Alerting Thresholds

#### **🚨 Critical Alerts**
- Any service completely down
- Error rate > 5%
- Response time > 10 seconds
- Memory usage > 90%

#### **⚠️ Warning Alerts**
- Response time > 5 seconds
- Error rate > 2%
- No evidence rate > 20%
- Summary generation failing

#### **📊 Info Notifications**
- High usage periods
- Successful deployments
- Performance improvements
- System statistics

### 6. Implementation Plan

#### **Phase 5.1: Enhanced Health Checks** 
- Expand current HealthController
- Add detailed service diagnostics
- Implement response time tracking
- Add LangChain health validation

#### **Phase 5.2: Metrics Collection**
- Create MetricsService for data collection
- Implement conversation memory metrics
- Add RAG system performance tracking
- GitHub sync monitoring

#### **Phase 5.3: Structured Logging**
- Upgrade to structured Winston logging
- Add correlation IDs
- Implement log aggregation
- Performance logging

#### **Phase 5.4: Monitoring Dashboard**
- Create admin API endpoints
- Performance metrics endpoints
- System statistics API
- Real-time health status

### 7. Monitoring Endpoints

```
GET  /healthz                    # Basic health (existing)
GET  /health/detailed           # Service-specific health
GET  /health/metrics            # Performance metrics
GET  /health/diagnostics        # Deep system diagnostics

GET  /admin/metrics/conversation  # Conversation memory stats
GET  /admin/metrics/rag          # RAG system performance
GET  /admin/metrics/sync         # GitHub sync status
GET  /admin/system/logs          # Recent logs
GET  /admin/system/performance   # Performance dashboard
```

### 8. Success Criteria

- ✅ Zero-downtime monitoring
- ✅ < 1 second health check response time
- ✅ Proactive issue detection
- ✅ Comprehensive error tracking
- ✅ Performance regression detection
- ✅ Self-healing capabilities where possible

This architecture provides comprehensive observability while maintaining high performance and reliability.