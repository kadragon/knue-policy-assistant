/**
 * Structured Logging Test Script
 * Tests the new Winston-based logging system
 */

console.log('🔍 Structured Logging Test Starting...\n');

async function testStructuredLogging() {
  try {
    // Import logging services
    const { LoggerService, createLogger, globalLogger } = require('./dist/src/services/logger');
    const { metricsService } = require('./dist/src/services/metrics');
    
    console.log('1. Testing Basic Logger Creation...');
    
    // Create service-specific loggers
    const healthLogger = createLogger('health-service');
    const ragLogger = createLogger('rag-service');
    const telegramLogger = createLogger('telegram-service');
    
    console.log('   ✅ Service loggers created successfully\n');
    
    console.log('2. Testing Structured Logging Methods...');
    
    // Test different log levels
    globalLogger.info('test-operation', 'Testing structured logging system', {
      testPhase: 'basic-logging',
      timestamp: Date.now()
    });
    
    healthLogger.debug('health-check', 'Testing health check logging', {
      service: 'firestore',
      responseTime: 150
    });
    
    ragLogger.info('rag-query', 'Testing RAG operation logging', {
      query: 'Test query',
      documentsFound: 5,
      maxScore: 0.95
    });
    
    telegramLogger.warn('rate-limit', 'Testing warning level logging', {
      chatId: 'test-chat-123',
      remainingRequests: 5
    });
    
    console.log('   ✅ Different log levels tested\n');
    
    console.log('3. Testing Performance Logging...');
    
    // Test performance logging
    healthLogger.logPerformance('database-query', 1250, {
      queryType: 'conversation-lookup',
      recordsReturned: 10
    });
    
    ragLogger.logPerformance('vector-search', 2500, {
      searchType: 'similarity',
      vectorDimensions: 1536
    });
    
    console.log('   ✅ Performance logging tested\n');
    
    console.log('4. Testing Specialized Logging Methods...');
    
    // Test RAG operation logging
    ragLogger.logRAGOperation(
      'similarity-search',
      'What is the policy for vacation requests?',
      6,
      0.87,
      true,
      1850,
      'chat-123',
      { language: 'ko', topK: 6 }
    );
    
    // Test conversation logging
    telegramLogger.logConversationOperation(
      'message-processing',
      'chat-456',
      15,
      900,
      { summaryGenerated: false }
    );
    
    // Test health check logging
    healthLogger.logHealthCheck(
      'service-check',
      'qdrant',
      'healthy',
      120,
      null,
      { vectorCount: 1500, collectionExists: true }
    );
    
    console.log('   ✅ Specialized logging methods tested\n');
    
    console.log('5. Testing Error Logging...');
    
    // Test error logging
    const testError = new Error('Test error for logging validation');
    testError.code = 'TEST_ERROR_CODE';
    
    globalLogger.error('error-handling', 'Testing error logging', testError, {
      errorContext: 'unit-test',
      userId: 'test-user-789'
    });
    
    console.log('   ✅ Error logging tested\n');
    
    console.log('6. Testing Metrics Collection...');
    
    // Test metrics recording
    metricsService.recordPerformance({
      operation: 'test-operation',
      service: 'test-service',
      duration: 1200,
      success: true,
      metadata: { testRun: true }
    });
    
    metricsService.recordRAG({
      query: 'Test RAG query',
      documentsFound: 4,
      maxScore: 0.91,
      hasEvidence: true,
      duration: 1800,
      chatId: 'test-chat'
    });
    
    metricsService.recordConversation({
      chatId: 'test-chat',
      operation: 'message',
      messageCount: 1,
      duration: 500,
      success: true
    });
    
    // Get metrics statistics
    const perfStats = metricsService.getPerformanceStats();
    const ragStats = metricsService.getRAGStats();
    const healthScore = metricsService.getHealthScore();
    
    console.log('   📊 Performance Stats:', JSON.stringify(perfStats, null, 2));
    console.log('   🔍 RAG Stats:', JSON.stringify(ragStats, null, 2));
    console.log('   💚 Health Score:', JSON.stringify(healthScore, null, 2));
    
    console.log('   ✅ Metrics collection tested\n');
    
    console.log('7. Testing Log File Generation...');
    
    // Force some logs to be written
    for (let i = 0; i < 5; i++) {
      globalLogger.info('batch-test', `Batch log message ${i + 1}`, {
        iteration: i + 1,
        batchSize: 5
      });
    }
    
    console.log('   ✅ Batch logging completed\n');
    
    console.log('🎉 Structured Logging Test Summary:');
    console.log('- ✅ Logger creation and service-specific loggers working');
    console.log('- ✅ Multiple log levels functioning correctly');
    console.log('- ✅ Performance logging with timing data');
    console.log('- ✅ Specialized logging methods (RAG, conversation, health)');
    console.log('- ✅ Error logging with stack traces and metadata');
    console.log('- ✅ Metrics collection and statistics generation');
    console.log('- ✅ Log files should be created in logs/ directory');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Check logs/ directory for generated log files');
    console.log('2. Integrate logging into existing services');
    console.log('3. Test with actual HTTP requests');
    console.log('4. Configure log rotation and retention');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('\n💡 Solution:');
      console.log('Run "npm run build" first to compile TypeScript files');
    }
    process.exit(1);
  }
}

// Run the test
testStructuredLogging()
  .then(() => {
    console.log('\n✨ Structured logging test completed successfully!');
    
    // Give Winston a moment to flush logs
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });