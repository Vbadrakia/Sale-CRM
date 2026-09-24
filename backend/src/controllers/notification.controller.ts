import { Request, Response } from 'express';
import { Notification } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { currentUser } from '../middleware/auth';

export async function listNotifications(req: Request, res: Response) {
  const user = currentUser(req);
  const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = { userId: user.id };
  if (req.query.unread === 'true') where.isRead = false;

  const { rows, count } = await Notification.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['createdAt', 'DESC']],
  });

  return sendPaginated(res, rows, buildPaginationMeta(page, pageSize, count));
}

export async function unreadCount(req: Request, res: Response) {
  const user = currentUser(req);
  try {
    const count = await Notification.count({ where: { userId: user.id, isRead: false } });
    return sendSuccess(res, { count });
  } catch (err: unknown) {
    console.warn(`[NOTIFICATION] unreadCount database check error for userId=${user.id}:`, err instanceof Error ? err.message : err);
    return sendSuccess(res, { count: 0 });
  }
}

export async function markRead(req: Request, res: Response) {
  const user = currentUser(req);
  const notification = await Notification.findOne({
    where: { id: Number(req.params.id), userId: user.id },
  });
  if (!notification) throw ApiError.notFound('Notification not found');
  notification.isRead = true;
  await notification.save();
  return sendSuccess(res, notification, 'Marked as read');
}

export async function markAllRead(req: Request, res: Response) {
  const user = currentUser(req);
  await Notification.update({ isRead: true }, { where: { userId: user.id, isRead: false } });
  return sendSuccess(res, { updated: true }, 'All notifications marked as read');
}
