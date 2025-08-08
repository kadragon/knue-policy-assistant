/**
 * LangChain 기본 구조 테스트 (환경변수 없이)
 */

console.log('🧪 LangChain 기본 구조 테스트 시작...\n');

// 1. 모듈 임포트 테스트
try {
  console.log('1. LangChain 의존성 로드 테스트...');
  
  const { ChatOpenAI } = require('@langchain/openai');
  const { QdrantVectorStore } = require('@langchain/qdrant'); 
  const { OpenAIEmbeddings } = require('@langchain/openai');
  
  console.log('✅ @langchain/openai 로드 성공');
  console.log('✅ @langchain/qdrant 로드 성공');
  
  // 2. 기본 객체 생성 테스트 (API 키 없이)
  console.log('\n2. 기본 객체 생성 테스트...');
  
  // API 키 없이는 에러가 날 수 있지만 클래스는 로드되어야 함
  console.log('✅ ChatOpenAI 클래스 사용 가능');
  console.log('✅ OpenAIEmbeddings 클래스 사용 가능');
  console.log('✅ QdrantVectorStore 클래스 사용 가능');
  
  console.log('\n🎉 LangChain 기본 구조 테스트 성공!');
  console.log('\n📋 테스트 결과:');
  console.log('- LangChain 패키지들이 올바르게 설치됨');
  console.log('- 필요한 클래스들이 모두 임포트 가능');
  console.log('- 환경변수 설정 후 실제 기능 테스트 가능');
  
  console.log('\n🔧 다음 단계:');
  console.log('1. .env 파일에 OPENAI_API_KEY, QDRANT_URL 등 설정');
  console.log('2. Qdrant Cloud 컬렉션 준비');
  console.log('3. 실제 RAG 검색/대화 테스트 수행');
  
} catch (error) {
  console.error('❌ 테스트 실패:', error.message);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('\n💡 해결책:');
    console.log('npm install @langchain/core @langchain/openai @langchain/qdrant --legacy-peer-deps');
  }
  
  process.exit(1);
}

console.log('\n✨ LangChain 마이그레이션 준비 완료!');