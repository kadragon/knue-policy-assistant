import { Request, Response } from 'express';
import crypto from 'crypto';
import { Timestamp } from '@google-cloud/firestore';
import { appConfig } from '../config';
import { getServices } from '../services';
import { ErrorUtils, DateUtils } from '../utils';

/**
 * GitHub Webhook 컨트롤러
 * 
 * 주요 기능:
 * 1. GitHub Push 이벤트 수신 및 서명 검증
 * 2. 변경된 파일 필터링 (*.md, README.md 제외)
 * 3. 데이터 동기화 작업 트리거
 * 4. 동기화 작업 상태 관리
 */
export class GitHubController {

  constructor() {
    // 서비스들은 getServices()로 런타임에 접근
  }

  /**
   * GitHub 웹훅 엔드포인트
   * POST /github/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // 웹훅 서명 검증
      if (!this.verifyWebhookSignature(req)) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Invalid webhook signature'
        });
        return;
      }

      const event = req.headers['x-github-event'] as string;
      
      // Push 이벤트만 처리
      if (event !== 'push') {
        console.log(`Ignoring GitHub event: ${event}`);
        res.status(200).json({ 
          ok: true, 
          message: `Ignored event: ${event}` 
        });
        return;
      }

      console.log('Received GitHub push event');
      
      const payload = req.body;
      const changedFiles = this.extractChangedFiles(payload);
      const filteredFiles = this.filterRelevantFiles(changedFiles);

      if (filteredFiles.length === 0) {
        console.log('No relevant files changed, skipping sync');
        res.status(200).json({ 
          ok: true, 
          message: 'No relevant files to sync' 
        });
        return;
      }

      console.log(`Processing ${filteredFiles.length} changed files:`, filteredFiles.map(f => f.path));

      // 비동기 동기화 작업 시작
      this.startSyncJob(payload.after, filteredFiles)
        .catch(error => {
          ErrorUtils.logError(error, 'Async Sync Job');
        });

      res.status(200).json({ 
        ok: true,
        message: 'Sync job started',
        filesCount: filteredFiles.length,
        timestamp: DateUtils.formatTimestamp()
      });

    } catch (error) {
      ErrorUtils.logError(error, 'GitHub Webhook');
      res.status(500).json({ 
        error: 'Internal server error',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 수동 동기화 트리거 (관리자용)
   * POST /api/sync/manual
   */
  async triggerManualSync(req: Request, res: Response): Promise<void> {
    try {
      const { branch = 'main', force = false } = req.body;
      
      console.log(`Manual sync triggered for branch: ${branch}`);
      
      // 전체 레포지토리 동기화 작업 시작
      this.startFullSyncJob(branch, force)
        .catch(error => {
          ErrorUtils.logError(error, 'Manual Sync Job');
        });

      res.json({
        success: true,
        message: 'Manual sync job started',
        branch,
        force,
        timestamp: DateUtils.formatTimestamp()
      });

    } catch (error) {
      ErrorUtils.logError(error, 'Manual Sync Trigger');
      res.status(500).json({ 
        error: 'Failed to trigger manual sync',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 동기화 작업 상태 조회 (관리자용)
   * GET /api/sync/status
   */
  async getSyncStatus(_req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();
      const recentJobs = await services.firestore.getRecentSyncJobs(appConfig.REPO_ID, 10);

      res.json({
        success: true,
        data: {
          recentJobs: recentJobs.map(job => ({
            jobId: job.jobId,
            type: job.type,
            status: job.status,
            filesAdded: job.filesAdded,
            filesModified: job.filesModified,
            filesDeleted: job.filesDeleted,
            startedAt: job.startedAt?.toDate(),
            completedAt: job.completedAt?.toDate(),
            errorMessage: job.error
          }))
        },
        timestamp: DateUtils.formatTimestamp()
      });

    } catch (error) {
      ErrorUtils.logError(error, 'Get Sync Status');
      res.status(500).json({ 
        error: 'Failed to get sync status',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 웹훅 서명 검증
   * GitHub Secret을 사용한 HMAC-SHA256 검증
   */
  private verifyWebhookSignature(req: Request): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);

    if (!signature) {
      console.warn('Missing webhook signature');
      return false;
    }

    if (!appConfig.GITHUB_WEBHOOK_SECRET) {
      console.warn('GITHUB_WEBHOOK_SECRET not configured');
      return true; // 개발 환경에서는 검증 생략
    }

    const expectedSignature = crypto
      .createHmac('sha256', appConfig.GITHUB_WEBHOOK_SECRET)
      .update(payload, 'utf8')
      .digest('hex');

    const receivedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  }

  /**
   * GitHub Push 페이로드에서 변경된 파일 목록 추출
   */
  private extractChangedFiles(payload: any): Array<{
    path: string;
    status: 'added' | 'modified' | 'removed';
    sha?: string;
  }> {
    const files: Array<{ path: string; status: 'added' | 'modified' | 'removed'; sha?: string; }> = [];

    // commits 배열에서 변경된 파일들 수집
    if (payload.commits && Array.isArray(payload.commits)) {
      for (const commit of payload.commits) {
        // Added files
        if (commit.added && Array.isArray(commit.added)) {
          for (const filePath of commit.added) {
            files.push({ path: filePath, status: 'added' });
          }
        }

        // Modified files
        if (commit.modified && Array.isArray(commit.modified)) {
          for (const filePath of commit.modified) {
            files.push({ path: filePath, status: 'modified' });
          }
        }

        // Removed files
        if (commit.removed && Array.isArray(commit.removed)) {
          for (const filePath of commit.removed) {
            files.push({ path: filePath, status: 'removed' });
          }
        }
      }
    }

    // 중복 제거 (동일한 파일이 여러 커밋에서 변경된 경우)
    const uniqueFiles = new Map<string, typeof files[0]>();
    for (const file of files) {
      uniqueFiles.set(file.path, file);
    }

    return Array.from(uniqueFiles.values());
  }

  /**
   * 관련 파일만 필터링
   * - .md 파일만 포함
   * - README.md 제외
   * - 특정 디렉터리 패턴 필터링
   */
  private filterRelevantFiles(files: Array<{
    path: string;
    status: 'added' | 'modified' | 'removed';
    sha?: string;
  }>): Array<{
    path: string;
    status: 'added' | 'modified' | 'removed';
    sha?: string;
  }> {
    return files.filter(file => {
      const path = file.path.toLowerCase();

      // .md 파일만 처리
      if (!path.endsWith('.md')) {
        return false;
      }

      // README.md 제외
      if (path.includes('readme.md') || path.includes('readme')) {
        return false;
      }

      // 숨김 파일/디렉터리 제외
      if (path.includes('/.')) {
        return false;
      }

      // node_modules, .git 등 제외
      const excludePatterns = [
        'node_modules/',
        '.git/',
        '.github/',
        'dist/',
        'build/',
        'docs/',
        '.docs/'
      ];

      for (const pattern of excludePatterns) {
        if (path.includes(pattern.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 비동기 동기화 작업 시작 (증분 동기화)
   */
  private async startSyncJob(
    commitSha: string, 
    changedFiles: Array<{
      path: string;
      status: 'added' | 'modified' | 'removed';
      sha?: string;
    }>
  ): Promise<void> {
    const services = getServices();
    const jobId = `sync_${Date.now()}_${commitSha.substring(0, 8)}`;

    try {
      console.log(`Starting sync job ${jobId} for commit ${commitSha}`);

      // 동기화 작업 생성
      await services.firestore.createSyncJob({
        jobId,
        repoId: appConfig.REPO_ID,
        type: 'webhook' as const,
        status: 'running',
        commit: commitSha,
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        filesTotal: changedFiles.length,
        filesProcessed: 0,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        startedAt: Timestamp.now()
      });

      // 파일별 처리
      let processedCount = 0;
      
      for (const file of changedFiles) {
        try {
          if (file.status === 'removed') {
            // 삭제된 파일 처리
            await services.github.deleteFileFromIndex(file.path);
          } else {
            // 추가/수정된 파일 처리
            await services.github.processFileChange(file.path, commitSha);
          }
          
          processedCount++;

          // 진행상황 업데이트 (매 5개 파일마다)
          if (processedCount % 5 === 0 || processedCount === changedFiles.length) {
            await services.firestore.updateSyncJobProgress(jobId, { filesProcessed: processedCount });
          }

        } catch (fileError) {
          ErrorUtils.logError(fileError, `File Processing - ${file.path}`);
          // 개별 파일 오류는 로그만 남기고 계속 진행
        }
      }

      // 작업 완료
      await services.firestore.completeSyncJob(jobId, { 
        status: 'completed' as const,
        filesProcessed: processedCount,
        completedAt: Timestamp.now()
      });
      console.log(`Sync job ${jobId} completed: ${processedCount}/${changedFiles.length} files processed`);

    } catch (error) {
      await services.firestore.failSyncJob(jobId, ErrorUtils.getErrorMessage(error));
      throw error;
    }
  }

  /**
   * 전체 동기화 작업 시작 (수동 트리거용)
   */
  private async startFullSyncJob(branch: string, force: boolean): Promise<void> {
    const services = getServices();
    const jobId = `full_sync_${Date.now()}_${branch}`;

    try {
      console.log(`Starting full sync job ${jobId} for branch ${branch}`);

      // 동기화 작업 생성
      await services.firestore.createSyncJob({
        jobId,
        repoId: appConfig.REPO_ID,
        type: 'manual' as const,
        status: 'running',
        branch,
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        filesTotal: 0, // 초기에는 알 수 없음
        filesProcessed: 0,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        startedAt: Timestamp.now()
      });

      // 전체 레포지토리 스캔 및 동기화
      await services.github.performFullSync(branch, force);

      // 작업 완료 (실제 처리된 파일 수는 GitHub 서비스에서 업데이트)
      await services.firestore.completeSyncJob(jobId, {
        status: 'completed' as const,
        completedAt: Timestamp.now()
      });
      console.log(`Full sync job ${jobId} completed`);

    } catch (error) {
      await services.firestore.failSyncJob(jobId, ErrorUtils.getErrorMessage(error));
      throw error;
    }
  }
}