import { db } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  static async log(action: string, entity: string, entityId?: string, userId?: string, payload?: any) {
    try {
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), userId || null, action, entity, entityId || null, payload ? JSON.stringify(payload) : null]
      );
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }
  }
}

