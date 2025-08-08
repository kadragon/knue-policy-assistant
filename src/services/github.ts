import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { 
  GitHubPushPayload, 
  FileChange, 
  Language 
} from '../types';
import { ServiceError } from '../types';
import { appConfig } from '../config';

export class GitHubService {
  private client: Octokit;
  private repoOwner: string;
  private repoName: string;
  private defaultBranch: string;
  private webhookSecret: string;

  constructor() {
    this.client = new Octokit();
    
    // Parse repository ID (format: "owner/repo")
    const repoParts = appConfig.REPO_ID.split('/');
    if (repoParts.length !== 2) {
      throw new Error(`Invalid repository format: ${appConfig.REPO_ID}. Expected format: "owner/repo"`);
    }
    
    this.repoOwner = repoParts[0] || '';
    this.repoName = repoParts[1] || '';
    this.defaultBranch = appConfig.DEFAULT_BRANCH;
    this.webhookSecret = appConfig.GITHUB_WEBHOOK_SECRET;
  }

  // Webhook signature verification
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');
      
      const receivedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
      );
    } catch (error) {
      throw new ServiceError(
        'Failed to verify webhook signature',
        'github',
        'SIGNATURE_VERIFICATION_ERROR',
        401,
        error
      );
    }
  }

  // Parse GitHub push webhook payload
  parsePushPayload(payload: any): GitHubPushPayload {
    try {
      // Validate required fields
      if (!payload.ref || !payload.repository || !payload.commits) {
        throw new Error('Invalid push payload structure');
      }

      return {
        ref: payload.ref,
        repository: {
          id: payload.repository.id,
          name: payload.repository.name,
          full_name: payload.repository.full_name,
          default_branch: payload.repository.default_branch
        },
        commits: payload.commits.map((commit: any) => ({
          id: commit.id,
          message: commit.message,
          added: commit.added || [],
          modified: commit.modified || [],
          removed: commit.removed || []
        })),
        head_commit: {
          id: payload.head_commit.id,
          message: payload.head_commit.message,
          added: payload.head_commit.added || [],
          modified: payload.head_commit.modified || [],
          removed: payload.head_commit.removed || []
        }
      };
    } catch (error) {
      throw new ServiceError(
        'Failed to parse push payload',
        'github',
        'PARSE_PAYLOAD_ERROR',
        400,
        error
      );
    }
  }

  // Check if push is to default branch
  isPushToDefaultBranch(payload: GitHubPushPayload): boolean {
    const branchName = payload.ref.replace('refs/heads/', '');
    return branchName === this.defaultBranch;
  }

  // Extract file changes from push payload
  extractFileChanges(payload: GitHubPushPayload): FileChange[] {
    const changes: FileChange[] = [];

    // Process added files
    payload.head_commit.added.forEach(filePath => {
      if (this.isMarkdownFile(filePath) && !this.isReadmeFile(filePath)) {
        changes.push({
          path: filePath,
          status: 'added'
        });
      }
    });

    // Process modified files
    payload.head_commit.modified.forEach(filePath => {
      if (this.isMarkdownFile(filePath) && !this.isReadmeFile(filePath)) {
        changes.push({
          path: filePath,
          status: 'modified'
        });
      }
    });

    // Process removed files
    payload.head_commit.removed.forEach(filePath => {
      if (this.isMarkdownFile(filePath) && !this.isReadmeFile(filePath)) {
        changes.push({
          path: filePath,
          status: 'removed'
        });
      }
    });

    return changes;
  }

  // Fetch file content from GitHub
  async getFileContent(filePath: string, ref?: string): Promise<string> {
    try {
      const response = await this.client.repos.getContent({
        owner: this.repoOwner,
        repo: this.repoName,
        path: filePath,
        ref: ref || this.defaultBranch
      });

      if (Array.isArray(response.data)) {
        throw new Error(`Path ${filePath} is a directory, not a file`);
      }

      if (response.data.type !== 'file') {
        throw new Error(`Path ${filePath} is not a file`);
      }

      if (!response.data.content) {
        throw new Error(`No content found for file ${filePath}`);
      }

      // Decode base64 content
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      throw new ServiceError(
        `Failed to get file content: ${filePath}`,
        'github',
        'GET_FILE_ERROR',
        500,
        error
      );
    }
  }

  // Fetch multiple files in batch
  async getMultipleFileContents(filePaths: string[], ref?: string): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const errors: string[] = [];

    // Process files in parallel with limited concurrency
    const concurrencyLimit = 5;
    for (let i = 0; i < filePaths.length; i += concurrencyLimit) {
      const batch = filePaths.slice(i, i + concurrencyLimit);
      const promises = batch.map(async (filePath) => {
        try {
          const content = await this.getFileContent(filePath, ref);
          contents.set(filePath, content);
        } catch (error) {
          errors.push(`${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      await Promise.all(promises);
    }

    if (errors.length > 0) {
      console.warn('Some files failed to fetch:', errors);
    }

    return contents;
  }

  // Get repository information
  async getRepositoryInfo(): Promise<any> {
    try {
      const response = await this.client.repos.get({
        owner: this.repoOwner,
        repo: this.repoName
      });

      return response.data;
    } catch (error) {
      throw new ServiceError(
        'Failed to get repository info',
        'github',
        'GET_REPO_INFO_ERROR',
        500,
        error
      );
    }
  }

  // Get latest commit information
  async getLatestCommit(branch?: string): Promise<any> {
    try {
      const response = await this.client.repos.getCommit({
        owner: this.repoOwner,
        repo: this.repoName,
        ref: branch || this.defaultBranch
      });

      return response.data;
    } catch (error) {
      throw new ServiceError(
        'Failed to get latest commit',
        'github',
        'GET_COMMIT_ERROR',
        500,
        error
      );
    }
  }

  // List all markdown files in repository
  async listMarkdownFiles(path: string = '', ref?: string): Promise<string[]> {
    try {
      const response = await this.client.repos.getContent({
        owner: this.repoOwner,
        repo: this.repoName,
        path: path,
        ref: ref || this.defaultBranch
      });

      const files: string[] = [];

      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          if (item.type === 'file' && this.isMarkdownFile(item.name) && !this.isReadmeFile(item.name)) {
            files.push(item.path);
          } else if (item.type === 'dir') {
            // Recursively get files from subdirectories
            const subFiles = await this.listMarkdownFiles(item.path, ref);
            files.push(...subFiles);
          }
        }
      }

      return files;
    } catch (error) {
      throw new ServiceError(
        'Failed to list markdown files',
        'github',
        'LIST_FILES_ERROR',
        500,
        error
      );
    }
  }

  // Generate GitHub URL for file
  generateFileUrl(filePath: string, commit?: string): string {
    const ref = commit || this.defaultBranch;
    return `https://github.com/${this.repoOwner}/${this.repoName}/blob/${ref}/${filePath}`;
  }

  // Extract file metadata
  extractFileMetadata(filePath: string, content: string): { title?: string; lang: Language } {
    // Extract language from path or content
    const lang = this.detectLanguage(filePath, content);
    
    // Extract title from markdown content (first H1)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1]?.trim() : undefined;

    return { title, lang };
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.getRepositoryInfo();
      return true;
    } catch {
      return false;
    }
  }

  // Private helper methods

  private isMarkdownFile(filePath: string): boolean {
    return /\.(md|markdown)$/i.test(filePath);
  }

  private isReadmeFile(filePath: string): boolean {
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    return fileName.startsWith('readme.');
  }

  private detectLanguage(filePath: string, content: string): Language {
    // Check file path for language indicators
    if (filePath.includes('/en/') || filePath.includes('/english/')) {
      return 'en';
    }
    
    // Check content for language patterns
    const koreanPattern = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    const hasKorean = koreanPattern.test(content.substring(0, 1000)); // Check first 1000 chars
    
    return hasKorean ? 'ko' : 'en';
  }

  // Utility methods
  getRepositoryId(): string {
    return `${this.repoOwner}/${this.repoName}`;
  }

  getDefaultBranch(): string {
    return this.defaultBranch;
  }

  // File processing utilities
  async processFileChanges(changes: FileChange[], commit: string): Promise<Map<string, string>> {
    const fileContents = new Map<string, string>();

    // Filter out removed files and get contents for added/modified files
    const filesToFetch = changes
      .filter(change => change.status !== 'removed')
      .map(change => change.path);

    if (filesToFetch.length > 0) {
      const contents = await this.getMultipleFileContents(filesToFetch, commit);
      for (const [path, content] of contents) {
        fileContents.set(path, content);
      }
    }

    return fileContents;
  }

  // Generate unique file ID
  generateFileId(repoId: string, filePath: string): string {
    const pathHash = crypto.createHash('md5').update(filePath).digest('hex');
    return `${repoId.replace('/', '_')}_${pathHash}`;
  }

  // Generate content hash
  generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Phase 4: 데이터 동기화 메서드들
   */

  /**
   * 단일 파일 변경 사항 처리
   * 파일을 다운로드하고, 청킹하고, 임베딩하여 Qdrant에 저장
   */
  async processFileChange(filePath: string, commitSha: string): Promise<void> {
    try {
      const services = require('./index').getServices();
      
      console.log(`Processing file change: ${filePath}`);

      // 1. 파일 내용 가져오기
      const content = await this.getFileContent(filePath, commitSha);
      
      // 2. 파일 메타데이터 생성
      const metadata = this.extractFileMetadata(filePath, content);
      const contentHash = this.generateContentHash(content);
      const fileId = this.generateFileId(this.getRepositoryId(), filePath);
      const fileUrl = this.generateFileUrl(filePath, commitSha);

      // 3. Firestore에 파일 메타데이터 저장
      await services.firestore.saveFileMetadata({
        fileId,
        repoId: this.getRepositoryId(),
        filePath,
        commit: commitSha,
        contentHash,
        title: metadata.title,
        lang: metadata.lang,
        url: fileUrl,
        processedAt: new Date()
      });

      // 4. 텍스트 청킹
      const chunks = services.openai.chunkText(content, filePath);
      
      console.log(`Created ${chunks.length} chunks for ${filePath}`);

      // 5. 각 청크에 대해 임베딩 생성 및 저장
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = `${fileId}_${i}`;

        // 임베딩 생성
        const embedding = await services.openai.generateEmbedding(chunk.text);

        // Qdrant에 저장
        await services.qdrant.upsertPoint(chunkId, embedding, {
          repoId: this.getRepositoryId(),
          fileId,
          filePath,
          commit: commitSha,
          seq: i,
          lang: metadata.lang,
          hash: contentHash,
          title: metadata.title || chunk.title,
          url: fileUrl
        });

        // Firestore에 청크 메타데이터 저장
        await services.firestore.saveChunkMetadata({
          chunkId,
          fileId,
          seq: i,
          text: chunk.text,
          title: chunk.title,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
          hash: this.generateContentHash(chunk.text)
        });
      }

      console.log(`Successfully processed file: ${filePath} (${chunks.length} chunks)`);

    } catch (error) {
      console.error(`Failed to process file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 파일 삭제 처리
   * Qdrant와 Firestore에서 해당 파일의 모든 데이터 삭제
   */
  async deleteFileFromIndex(filePath: string): Promise<void> {
    try {
      const services = require('./index').getServices();
      const fileId = this.generateFileId(this.getRepositoryId(), filePath);
      
      console.log(`Deleting file from index: ${filePath}`);

      // 1. Qdrant에서 해당 파일의 모든 포인트 삭제
      await services.qdrant.deletePointsByFilter({
        must: [
          {
            key: 'fileId',
            match: { value: fileId }
          }
        ]
      });

      // 2. Firestore에서 청크 메타데이터 삭제
      await services.firestore.deleteChunksByFileId(fileId);

      // 3. Firestore에서 파일 메타데이터 삭제
      await services.firestore.deleteFileMetadata(fileId);

      console.log(`Successfully deleted file from index: ${filePath}`);

    } catch (error) {
      console.error(`Failed to delete file ${filePath} from index:`, error);
      throw error;
    }
  }

  /**
   * 전체 레포지토리 동기화
   * 모든 마크다운 파일을 스캔하고 처리
   */
  async performFullSync(branch: string = 'main', force: boolean = false): Promise<void> {
    try {
      const services = require('./index').getServices();
      
      console.log(`Starting full sync for branch: ${branch}`);

      // 1. 최신 커밋 정보 가져오기
      const latestCommit = await this.getLatestCommit(branch);
      const commitSha = latestCommit.sha;

      // 2. 모든 마크다운 파일 목록 가져오기
      const allFiles = await this.listMarkdownFiles('', commitSha);
      console.log(`Found ${allFiles.length} markdown files to process`);

      // 3. 기존 처리된 파일들과 비교 (force가 아닌 경우)
      let filesToProcess = allFiles;
      
      if (!force) {
        const processedFiles = await services.firestore.getProcessedFiles(
          this.getRepositoryId(), 
          commitSha
        );
        
        filesToProcess = allFiles.filter(filePath => {
          const fileId = this.generateFileId(this.getRepositoryId(), filePath);
          return !processedFiles.has(fileId);
        });
        
        console.log(`${filesToProcess.length} files need processing (${allFiles.length - filesToProcess.length} already processed)`);
      }

      // 4. 파일들을 배치로 처리 (동시성 제한)
      const batchSize = 5;
      let processed = 0;

      for (let i = 0; i < filesToProcess.length; i += batchSize) {
        const batch = filesToProcess.slice(i, i + batchSize);
        
        // 배치 내 파일들을 병렬 처리
        const batchPromises = batch.map(async (filePath) => {
          try {
            await this.processFileChange(filePath, commitSha);
            processed++;
          } catch (error) {
            console.error(`Failed to process ${filePath}:`, error);
          }
        });

        await Promise.all(batchPromises);
        
        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filesToProcess.length / batchSize)} (${processed}/${filesToProcess.length} files)`);
      }

      // 5. 레포지토리 메타데이터 업데이트
      await services.firestore.updateRepositoryMetadata({
        repoId: this.getRepositoryId(),
        lastSyncCommit: commitSha,
        lastSyncAt: new Date(),
        fileCount: allFiles.length,
        processedCount: processed
      });

      console.log(`Full sync completed: ${processed}/${filesToProcess.length} files processed`);

    } catch (error) {
      console.error('Full sync failed:', error);
      throw error;
    }
  }

  /**
   * 레포지토리 상태 확인
   * 현재 인덱싱 상태와 최신 커밋 비교
   */
  async getRepositoryStatus(): Promise<{
    repoId: string;
    latestCommit: string;
    lastSyncCommit?: string;
    lastSyncAt?: Date;
    totalFiles: number;
    indexedFiles: number;
    needsSync: boolean;
  }> {
    try {
      const services = require('./index').getServices();
      
      // 최신 커밋 정보
      const latestCommit = await this.getLatestCommit();
      const latestCommitSha = latestCommit.sha;

      // 레포지토리 메타데이터 조회
      const repoMetadata = await services.firestore.getRepositoryMetadata(this.getRepositoryId());

      // 전체 마크다운 파일 수
      const allFiles = await this.listMarkdownFiles('', latestCommitSha);
      const totalFiles = allFiles.length;

      // 인덱싱된 파일 수 
      const indexedFiles = await services.firestore.getIndexedFileCount(this.getRepositoryId());

      // 동기화 필요 여부
      const needsSync = !repoMetadata?.lastSyncCommit || 
                       repoMetadata.lastSyncCommit !== latestCommitSha ||
                       indexedFiles < totalFiles;

      return {
        repoId: this.getRepositoryId(),
        latestCommit: latestCommitSha,
        lastSyncCommit: repoMetadata?.lastSyncCommit,
        lastSyncAt: repoMetadata?.lastSyncAt,
        totalFiles,
        indexedFiles,
        needsSync
      };

    } catch (error) {
      console.error('Failed to get repository status:', error);
      throw error;
    }
  }
}