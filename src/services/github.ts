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
}