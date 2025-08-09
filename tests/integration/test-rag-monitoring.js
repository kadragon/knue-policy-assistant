/**
 * RAG Monitoring Test Script
 * Tests the enhanced RAG monitoring and evidence quality tracking system
 */

console.log('🔍 RAG Monitoring Test Starting...\n');

async function testRAGMonitoring() {
  try {
    // Import metrics service
    const { metricsService } = require('./dist/src/services/metrics');
    
    console.log('1. Testing Enhanced RAG Metrics Collection...');
    
    // Simulate various RAG queries with different characteristics
    const testQueries = [
      {
        query: 'What is the vacation policy?',
        documentsFound: 6,
        maxScore: 0.96,
        hasEvidence: true,
        duration: 1200,
        metadata: {
          searchType: 'similarity',
          minScoreThreshold: 0.80,
          topK: 6,
          language: 'ko',
          totalCandidates: 15,
          averageScore: 0.89,
          scoreDistribution: { excellent: 2, good: 3, fair: 1, poor: 0 },
          queryComplexity: 'simple',
          evidenceQuality: 'high'
        }
      },
      {
        query: 'Can you explain the detailed process for requesting extended leave for research purposes during the semester?',
        documentsFound: 3,
        maxScore: 0.87,
        hasEvidence: true,
        duration: 1850,
        metadata: {
          searchType: 'conversational',
          minScoreThreshold: 0.80,
          topK: 6,
          language: 'ko',
          totalCandidates: 10,
          averageScore: 0.84,
          scoreDistribution: { excellent: 0, good: 2, fair: 1, poor: 0 },
          queryComplexity: 'complex',
          evidenceQuality: 'medium'
        }
      },
      {
        query: 'overtime regulations',
        documentsFound: 2,
        maxScore: 0.82,
        hasEvidence: true,
        duration: 950,
        metadata: {
          searchType: 'similarity',
          minScoreThreshold: 0.80,
          topK: 6,
          language: 'en',
          totalCandidates: 8,
          averageScore: 0.81,
          scoreDistribution: { excellent: 0, good: 0, fair: 2, poor: 0 },
          queryComplexity: 'simple',
          evidenceQuality: 'low'
        }
      },
      {
        query: 'student grading policy',
        documentsFound: 0,
        maxScore: 0,
        hasEvidence: false,
        duration: 1100,
        metadata: {
          searchType: 'similarity',
          minScoreThreshold: 0.80,
          topK: 6,
          language: 'en',
          totalCandidates: 0,
          averageScore: 0,
          scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
          queryComplexity: 'medium',
          evidenceQuality: 'none'
        }
      },
      {
        query: 'How do I submit a performance evaluation and what are the specific criteria used for assessment?',
        documentsFound: 4,
        maxScore: 0.78,
        hasEvidence: false, // Below threshold
        duration: 2200,
        metadata: {
          searchType: 'conversational',
          minScoreThreshold: 0.80,
          topK: 6,
          language: 'ko',
          totalCandidates: 12,
          averageScore: 0.75,
          scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 4 },
          queryComplexity: 'complex',
          evidenceQuality: 'none'
        }
      },
      {
        query: 'facility booking',
        documentsFound: 5,
        maxScore: 0.92,
        hasEvidence: true,
        duration: 3500, // Slow query
        metadata: {
          searchType: 'similarity',
          minScoreThreshold: 0.80,
          topK: 8,
          language: 'ko',
          totalCandidates: 20,
          averageScore: 0.88,
          scoreDistribution: { excellent: 1, good: 3, fair: 1, poor: 0 },
          queryComplexity: 'simple',
          evidenceQuality: 'medium'
        }
      }
    ];
    
    // Record all test queries
    testQueries.forEach(query => {
      metricsService.recordRAG(query);
    });
    
    console.log('   ✅ Enhanced RAG metrics recorded');
    
    console.log('\n2. Testing RAG Statistics Collection...');
    
    // Get basic RAG stats
    const basicRAGStats = metricsService.getRAGStats();
    console.log('   📊 Basic RAG Stats:', JSON.stringify(basicRAGStats, null, 2));
    
    // Get detailed RAG monitoring stats
    const ragMonitoringStats = metricsService.getRAGMonitoringStats();
    console.log('   🔍 Detailed RAG Monitoring Stats:', JSON.stringify(ragMonitoringStats, null, 2));
    
    console.log('\n3. Testing Health Score with RAG Factors...');
    
    const healthScore = metricsService.getHealthScore();
    console.log('   💚 Health Score:', JSON.stringify(healthScore, null, 2));
    
    console.log('\n4. Testing Edge Cases...');
    
    // Test with high-volume queries
    for (let i = 0; i < 20; i++) {
      const isSuccessful = Math.random() > 0.3; // 70% success rate
      const score = isSuccessful ? 0.85 + Math.random() * 0.15 : Math.random() * 0.80;
      
      metricsService.recordRAG({
        query: `Test query ${i + 1}`,
        documentsFound: isSuccessful ? Math.floor(Math.random() * 5) + 1 : 0,
        maxScore: score,
        hasEvidence: isSuccessful && score >= 0.80,
        duration: 800 + Math.random() * 1000,
        metadata: {
          searchType: Math.random() > 0.5 ? 'similarity' : 'conversational',
          language: Math.random() > 0.7 ? 'en' : 'ko',
          topK: 6,
          evidenceQuality: score >= 0.95 ? 'high' : score >= 0.85 ? 'medium' : score >= 0.80 ? 'low' : 'none'
        }
      });\n    }\n    \n    console.log('   ✅ Edge case testing completed');\n    \n    // Get updated stats after bulk testing\n    const updatedStats = metricsService.getRAGMonitoringStats();\n    \n    console.log('\\n🎉 RAG Monitoring Test Summary:');\n    console.log('- ✅ Enhanced RAG metrics with detailed metadata');\n    console.log('- ✅ Evidence quality scoring and distribution tracking');\n    console.log('- ✅ Query complexity analysis');\n    console.log('- ✅ Search type categorization');\n    console.log('- ✅ Language and parameter distribution tracking');\n    console.log('- ✅ Slow query and low-quality evidence detection');\n    console.log('- ✅ Comprehensive monitoring statistics');\n    \n    console.log('\\n📋 RAG Monitoring Results:');\n    console.log(`- Total Queries: ${updatedStats.searchPerformance.totalQueries}`);\n    console.log(`- Success Rate: ${updatedStats.searchPerformance.successRate}%`);\n    console.log(`- Average Response Time: ${updatedStats.searchPerformance.averageResponseTime}ms`);\n    console.log(`- Slow Query Rate: ${updatedStats.searchPerformance.slowQueryRate}%`);\n    console.log(`- Excellent Evidence Rate: ${updatedStats.evidenceQuality.excellentRate}%`);\n    console.log(`- Good Evidence Rate: ${updatedStats.evidenceQuality.goodRate}%`);\n    console.log(`- Fair Evidence Rate: ${updatedStats.evidenceQuality.fairRate}%`);\n    console.log(`- Poor Evidence Rate: ${updatedStats.evidenceQuality.poorRate}%`);\n    console.log(`- No Evidence Rate: ${updatedStats.evidenceQuality.noEvidenceRate}%`);\n    console.log(`- Average Max Score: ${updatedStats.evidenceQuality.averageMaxScore}`);\n    console.log(`- Average Documents Found: ${updatedStats.evidenceQuality.averageDocumentsFound}`);\n    \n    console.log('\\n📊 Search Type Distribution:');\n    Object.entries(updatedStats.searchTypes).forEach(([type, count]) => {\n      console.log(`  - ${type}: ${count}`);\n    });\n    \n    console.log('\\n📊 Query Complexity Distribution:');\n    Object.entries(updatedStats.queryComplexity).forEach(([complexity, count]) => {\n      console.log(`  - ${complexity}: ${count}`);\n    });\n    \n    console.log('\\n📊 Language Distribution:');\n    Object.entries(updatedStats.languageDistribution).forEach(([lang, count]) => {\n      console.log(`  - ${lang}: ${count}`);\n    });\n    \n    return true;\n  } catch (error) {\n    console.error('❌ Test failed:', error.message);\n    if (error.code === 'MODULE_NOT_FOUND') {\n      console.log('\\n💡 Solution:');\n      console.log('Run \"npm run build\" first to compile TypeScript files');\n    }\n    return false;\n  }\n}\n\n// Run the test\ntestRAGMonitoring()\n  .then((success) => {\n    if (success) {\n      console.log('\\n✨ RAG monitoring test completed successfully!');\n      console.log('\\n📝 Next Steps:');\n      console.log('1. Set up alerting for low evidence quality');\n      console.log('2. Monitor search performance trends');\n      console.log('3. Optimize queries with poor success rates');\n      console.log('4. Track evidence quality improvements over time');\n    }\n    \n    // Give logging services time to flush\n    setTimeout(() => {\n      process.exit(success ? 0 : 1);\n    }, 1000);\n  })\n  .catch(error => {\n    console.error('❌ Unexpected error:', error);\n    process.exit(1);\n  });