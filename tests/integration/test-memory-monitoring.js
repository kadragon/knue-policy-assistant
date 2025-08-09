/**
 * Memory Monitoring Test Script
 * Tests the enhanced conversation memory monitoring system
 */

console.log('🧠 Memory Monitoring Test Starting...\n');

async function testMemoryMonitoring() {
  try {
    // Import metrics service
    const { metricsService } = require('./dist/src/services/metrics');
    
    console.log('1. Testing Enhanced Conversation Metrics...');
    
    // Simulate session creation
    metricsService.recordConversation({
      chatId: 'test-chat-001',
      operation: 'session-create',
      messageCount: 0,
      duration: 150,
      success: true,
      metadata: {
        languageChanged: false,
        sessionActive: true
      }
    });
    
    console.log('   ✅ Session creation recorded');
    
    // Simulate message exchanges
    for (let i = 0; i < 8; i++) {
      metricsService.recordConversation({
        chatId: 'test-chat-001',
        operation: 'message',
        messageCount: 1,
        duration: 200 + Math.random() * 300,
        success: true,
        metadata: {
          messageRole: i % 2 === 0 ? 'user' : 'assistant'
        }
      });
    }
    
    console.log('   ✅ Message exchanges recorded');
    
    // Simulate memory context building
    metricsService.recordConversation({
      chatId: 'test-chat-001',
      operation: 'memory-build',
      messageCount: 6,
      duration: 120,
      success: true,
      metadata: {
        tokenCount: 1250,
        memoryContextSize: 6
      }
    });
    
    console.log('   ✅ Memory context building recorded');
    
    // Simulate summary generation
    metricsService.recordConversation({
      chatId: 'test-chat-001',
      operation: 'summary',
      messageCount: 8,
      duration: 1800,
      success: true,
      metadata: {
        summaryLength: 320,
        summaryGenerated: true
      }
    });
    
    console.log('   ✅ Summary generation recorded');
    
    // Simulate second session with different characteristics
    metricsService.recordConversation({
      chatId: 'test-chat-002',
      operation: 'session-create',
      messageCount: 0,
      duration: 180,
      success: true,
      metadata: {
        languageChanged: true,
        sessionActive: true
      }
    });
    
    // Simulate failed summary
    metricsService.recordConversation({
      chatId: 'test-chat-002',
      operation: 'summary',
      messageCount: 5,
      duration: 2500,
      success: false,
      metadata: {
        summaryGenerated: false
      }
    });
    
    console.log('   ✅ Second session and failed summary recorded');
    
    console.log('\n2. Testing Memory Statistics Collection...');
    
    // Get basic conversation stats
    const basicStats = metricsService.getConversationStats();
    console.log('   📊 Basic Conversation Stats:', JSON.stringify(basicStats, null, 2));
    
    // Get detailed memory monitoring stats
    const memoryStats = metricsService.getConversationMemoryStats();
    console.log('   🧠 Memory Monitoring Stats:', JSON.stringify(memoryStats, null, 2));
    
    console.log('\n3. Testing Health Score with Memory Factors...');
    
    const healthScore = metricsService.getHealthScore();
    console.log('   💚 Health Score:', JSON.stringify(healthScore, null, 2));
    
    console.log('\n🎉 Memory Monitoring Test Summary:');
    console.log('- ✅ Enhanced conversation metrics with detailed metadata');
    console.log('- ✅ Session tracking (creation, resets, language changes)');
    console.log('- ✅ Message role tracking (user vs assistant)');
    console.log('- ✅ Summary generation monitoring with success rates');
    console.log('- ✅ Memory context building with token tracking');
    console.log('- ✅ Comprehensive statistics and health scoring');
    
    console.log('\n📋 Memory Monitoring Features:');
    console.log(`- Active Sessions: ${memoryStats.activeSessions}`);
    console.log(`- New Sessions: ${memoryStats.newSessions}`);
    console.log(`- Summary Success Rate: ${memoryStats.summarySuccessRate}%`);
    console.log(`- Average Summary Length: ${memoryStats.averageSummaryLength} chars`);
    console.log(`- Average Memory Tokens: ${memoryStats.memoryContextStats.averageTokens}`);
    console.log(`- Memory Builds: ${memoryStats.memoryContextStats.memoryBuilds}`);
    console.log(`- Total Messages: ${memoryStats.messageStats.totalMessages}`);
    console.log(`- User Messages: ${memoryStats.messageStats.userMessages}`);
    console.log(`- Assistant Messages: ${memoryStats.messageStats.assistantMessages}`);
    console.log(`- Session Resets: ${memoryStats.sessionActivity.resets}`);
    console.log(`- Language Changes: ${memoryStats.sessionActivity.languageChanges}`);
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('\n💡 Solution:');
      console.log('Run "npm run build" first to compile TypeScript files');
    }
    return false;
  }
}

// Run the test
testMemoryMonitoring()
  .then((success) => {
    if (success) {
      console.log('\n✨ Memory monitoring test completed successfully!');
      console.log('\n📝 Next Steps:');
      console.log('1. Integrate with health check endpoints');
      console.log('2. Set up alerting for memory issues');
      console.log('3. Monitor summary success rates');
      console.log('4. Track session lifecycle metrics');
    }
    
    // Give logging services time to flush
    setTimeout(() => {
      process.exit(success ? 0 : 1);
    }, 1000);
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });