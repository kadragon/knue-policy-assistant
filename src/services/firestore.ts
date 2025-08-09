import { Firestore, Timestamp, DocumentData, QueryDocumentSnapshot } from '@google-cloud/firestore';
import { 
  Repository, 
  FileMetadata, 
  TextChunk, 
  SyncJob, 
  Conversation, 
  Message, 
  UserPreferences,
  COLLECTION_NAMES,
  DEFAULT_VALUES
} from '../types';
import { ServiceError } from '../types';
import { appConfig } from '../config';

export class FirestoreService {
  private db: Firestore;

  constructor() {
    this.db = new Firestore({
      projectId: appConfig.FIRESTORE_PROJECT_ID,
    });
  }

  // Repository operations
  async getRepository(repoId: string): Promise<Repository | null> {
    try {
      const doc = await this.db.collection(COLLECTION_NAMES.REPOSITORIES).doc(repoId).get();
      if (!doc.exists) return null;
      return this.convertToRepository(doc as QueryDocumentSnapshot<DocumentData>);
    } catch (error) {
      throw new ServiceError('Failed to get repository', 'firestore', 'GET_REPO_ERROR', 500, error);
    }
  }

  async saveRepository(repo: Repository): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.REPOSITORIES).doc(repo.repoId).set(repo);
    } catch (error) {
      throw new ServiceError('Failed to save repository', 'firestore', 'SAVE_REPO_ERROR', 500, error);
    }
  }

  // File metadata operations
  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    try {
      const doc = await this.db.collection(COLLECTION_NAMES.FILES).doc(fileId).get();
      if (!doc.exists) return null;
      return this.convertToFileMetadata(doc as QueryDocumentSnapshot<DocumentData>);
    } catch (error) {
      throw new ServiceError('Failed to get file metadata', 'firestore', 'GET_FILE_ERROR', 500, error);
    }
  }

  async saveFileMetadata(file: FileMetadata): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.FILES).doc(file.fileId).set(file);
    } catch (error) {
      throw new ServiceError('Failed to save file metadata', 'firestore', 'SAVE_FILE_ERROR', 500, error);
    }
  }

  async deleteFileMetadata(fileId: string): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.FILES).doc(fileId).delete();
    } catch (error) {
      throw new ServiceError('Failed to delete file metadata', 'firestore', 'DELETE_FILE_ERROR', 500, error);
    }
  }

  // Text chunk operations
  async saveTextChunk(chunk: TextChunk): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.CHUNKS).doc(chunk.chunkId).set(chunk);
    } catch (error) {
      throw new ServiceError('Failed to save text chunk', 'firestore', 'SAVE_CHUNK_ERROR', 500, error);
    }
  }

  async deleteTextChunks(fileId: string): Promise<void> {
    try {
      const chunks = await this.db.collection(COLLECTION_NAMES.CHUNKS)
        .where('fileId', '==', fileId)
        .get();
      
      const batch = this.db.batch();
      chunks.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (error) {
      throw new ServiceError('Failed to delete text chunks', 'firestore', 'DELETE_CHUNKS_ERROR', 500, error);
    }
  }

  // Sync job operations
  async saveSyncJob(job: SyncJob): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.JOBS).doc(job.jobId).set(job);
    } catch (error) {
      throw new ServiceError('Failed to save sync job', 'firestore', 'SAVE_JOB_ERROR', 500, error);
    }
  }

  // Conversation session operations
  async getConversation(chatId: string): Promise<Conversation | null> {
    try {
      const doc = await this.db.collection(COLLECTION_NAMES.CONVERSATIONS).doc(chatId).get();
      if (!doc.exists) return null;
      return this.convertToConversation(doc as QueryDocumentSnapshot<DocumentData>);
    } catch (error) {
      throw new ServiceError('Failed to get conversation', 'firestore', 'GET_CONVERSATION_ERROR', 500, error);
    }
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.CONVERSATIONS).doc(conversation.chatId).set(conversation);
    } catch (error) {
      throw new ServiceError('Failed to save conversation', 'firestore', 'SAVE_CONVERSATION_ERROR', 500, error);
    }
  }

  async resetConversation(chatId: string): Promise<void> {
    try {
      // Delete all messages for this chat
      const messages = await this.db.collection(COLLECTION_NAMES.MESSAGES)
        .where('chatId', '==', chatId)
        .get();
      
      const batch = this.db.batch();
      messages.forEach(doc => batch.delete(doc.ref));
      
      // Reset conversation summary
      const conversationRef = this.db.collection(COLLECTION_NAMES.CONVERSATIONS).doc(chatId);
      batch.update(conversationRef, {
        summary: null,
        messageCount: 0,
        updatedAt: Timestamp.now()
      });
      
      await batch.commit();
    } catch (error) {
      throw new ServiceError('Failed to reset conversation', 'firestore', 'RESET_CONVERSATION_ERROR', 500, error);
    }
  }

  // Message operations
  async saveMessage(message: Message): Promise<void> {
    try {
      const messageId = `${message.chatId}_${message.createdAt.toMillis()}`;
      await this.db.collection(COLLECTION_NAMES.MESSAGES).doc(messageId).set({
        ...message,
        messageId
      });
      
      // Update conversation message count and last message time
      const conversationRef = this.db.collection(COLLECTION_NAMES.CONVERSATIONS).doc(message.chatId);
      await conversationRef.set({
        chatId: message.chatId,
        messageCount: await this.getMessageCount(message.chatId) + 1,
        lastMessageAt: message.createdAt,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      throw new ServiceError('Failed to save message', 'firestore', 'SAVE_MESSAGE_ERROR', 500, error);
    }
  }

  async getRecentMessages(chatId: string, limit: number = DEFAULT_VALUES.MAX_RECENT_MESSAGES): Promise<Message[]> {
    try {
      const snapshot = await this.db.collection(COLLECTION_NAMES.MESSAGES)
        .where('chatId', '==', chatId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      return snapshot.docs
        .map(doc => this.convertToMessage(doc))
        .reverse(); // Return in chronological order
    } catch (error) {
      throw new ServiceError('Failed to get recent messages', 'firestore', 'GET_MESSAGES_ERROR', 500, error);
    }
  }

  async getMessageCount(chatId: string): Promise<number> {
    try {
      const snapshot = await this.db.collection(COLLECTION_NAMES.MESSAGES)
        .where('chatId', '==', chatId)
        .count()
        .get();
      
      return snapshot.data().count;
    } catch (error) {
      throw new ServiceError('Failed to get message count', 'firestore', 'COUNT_MESSAGES_ERROR', 500, error);
    }
  }

  // User preferences operations
  async getUserPreferences(chatId: string): Promise<UserPreferences | null> {
    try {
      const doc = await this.db.collection(COLLECTION_NAMES.USER_PREFS).doc(chatId).get();
      if (!doc.exists) return null;
      return this.convertToUserPreferences(doc as QueryDocumentSnapshot<DocumentData>);
    } catch (error) {
      throw new ServiceError('Failed to get user preferences', 'firestore', 'GET_PREFS_ERROR', 500, error);
    }
  }

  async saveUserPreferences(prefs: UserPreferences): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.USER_PREFS).doc(prefs.chatId).set(prefs);
    } catch (error) {
      throw new ServiceError('Failed to save user preferences', 'firestore', 'SAVE_PREFS_ERROR', 500, error);
    }
  }

  // Helper methods for conversation memory management
  async shouldTriggerSummary(chatId: string): Promise<boolean> {
    try {
      const conversation = await this.getConversation(chatId);
      if (!conversation) return false;
      
      // Trigger summary if message count exceeds threshold
      if (conversation.messageCount >= DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES) {
        return true;
      }
      
      // Check total character count
      const recentMessages = await this.getRecentMessages(chatId, DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES);
      const totalChars = recentMessages.reduce((sum, msg) => sum + msg.text.length, 0);
      
      return totalChars >= DEFAULT_VALUES.SUMMARY_TRIGGER_CHARS;
    } catch (error) {
      throw new ServiceError('Failed to check summary trigger', 'firestore', 'CHECK_SUMMARY_ERROR', 500, error);
    }
  }

  async updateConversationSummary(chatId: string, summary: string): Promise<void> {
    try {
      const conversationRef = this.db.collection(COLLECTION_NAMES.CONVERSATIONS).doc(chatId);
      await conversationRef.update({
        summary,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new ServiceError('Failed to update conversation summary', 'firestore', 'UPDATE_SUMMARY_ERROR', 500, error);
    }
  }

  // Sync job operations
  async createSyncJob(job: SyncJob): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.JOBS).doc(job.jobId).set(job);
    } catch (error) {
      throw new ServiceError('Failed to create sync job', 'firestore', 'CREATE_SYNC_JOB_ERROR', 500, error);
    }
  }

  async getRecentSyncJobs(repoId: string, limit: number = 10): Promise<SyncJob[]> {
    try {
      const snapshot = await this.db
        .collection(COLLECTION_NAMES.JOBS)
        .where('repoId', '==', repoId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => this.convertToSyncJob(doc as QueryDocumentSnapshot<DocumentData>));
    } catch (error) {
      throw new ServiceError('Failed to get recent sync jobs', 'firestore', 'GET_SYNC_JOBS_ERROR', 500, error);
    }
  }

  async updateSyncJobProgress(jobId: string, progress: Partial<SyncJob>): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.JOBS).doc(jobId).update({
        ...progress,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new ServiceError('Failed to update sync job progress', 'firestore', 'UPDATE_SYNC_JOB_ERROR', 500, error);
    }
  }

  async completeSyncJob(jobId: string, results: Partial<SyncJob>): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.JOBS).doc(jobId).update({
        ...results,
        status: 'completed',
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new ServiceError('Failed to complete sync job', 'firestore', 'COMPLETE_SYNC_JOB_ERROR', 500, error);
    }
  }

  async failSyncJob(jobId: string, errorMessage: string): Promise<void> {
    try {
      await this.db.collection(COLLECTION_NAMES.JOBS).doc(jobId).update({
        status: 'failed',
        errorMessage,
        failedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new ServiceError('Failed to fail sync job', 'firestore', 'FAIL_SYNC_JOB_ERROR', 500, error);
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      // Test connection by reading from a system collection
      await this.db.collection('_health_check').limit(1).get();
      return true;
    } catch {
      return false;
    }
  }

  // Conversion helpers
  private convertToRepository(doc: QueryDocumentSnapshot<DocumentData>): Repository {
    const data = doc.data();
    return {
      repoId: doc.id,
      name: data['name'],
      defaultBranch: data['defaultBranch'],
      lastSyncCommit: data['lastSyncCommit'],
      lastSyncAt: data['lastSyncAt'],
      isActive: data['isActive'],
      description: data['description'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt']
    };
  }

  private convertToFileMetadata(doc: QueryDocumentSnapshot<DocumentData>): FileMetadata {
    const data = doc.data();
    return {
      fileId: doc.id,
      repoId: data['repoId'],
      filePath: data['filePath'],
      fileName: data['fileName'],
      commit: data['commit'],
      contentHash: data['contentHash'],
      size: data['size'],
      lang: data['lang'],
      title: data['title'],
      isActive: data['isActive'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt']
    };
  }

  private convertToConversation(doc: QueryDocumentSnapshot<DocumentData>): Conversation {
    const data = doc.data();
    return {
      chatId: doc.id,
      summary: data['summary'],
      lang: data['lang'] || DEFAULT_VALUES.LANG,
      messageCount: data['messageCount'] || 0,
      lastMessageAt: data['lastMessageAt'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt']
    };
  }

  private convertToMessage(doc: QueryDocumentSnapshot<DocumentData>): Message {
    const data = doc.data();
    return {
      messageId: doc.id,
      chatId: data['chatId'],
      role: data['role'],
      text: data['text'],
      metadata: data['metadata'],
      createdAt: data['createdAt']
    };
  }

  private convertToUserPreferences(doc: QueryDocumentSnapshot<DocumentData>): UserPreferences {
    const data = doc.data();
    return {
      chatId: doc.id,
      lang: data['lang'],
      notificationsEnabled: data['notificationsEnabled'],
      timezone: data['timezone'],
      metadata: data['metadata'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt']
    };
  }

  private convertToSyncJob(doc: QueryDocumentSnapshot<DocumentData>): SyncJob {
    const data = doc.data();
    return {
      jobId: doc.id,
      repoId: data['repoId'],
      type: data['type'],
      status: data['status'],
      commit: data['commit'],
      filesAdded: data['filesAdded'] || 0,
      filesModified: data['filesModified'] || 0,
      filesDeleted: data['filesDeleted'] || 0,
      chunksCreated: data['chunksCreated'] || 0,
      chunksUpdated: data['chunksUpdated'] || 0,
      chunksDeleted: data['chunksDeleted'] || 0,
      error: data['error'],
      startedAt: data['startedAt'],
      completedAt: data['completedAt']
    };
  }
}