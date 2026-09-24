import { sequelize } from '../config/database';
import { User } from './User';
import { Lead } from './Lead';
import { Customer } from './Customer';
import { FollowUp } from './FollowUp';
import { Activity } from './Activity';
import { Notification } from './Notification';
import { OtpToken } from './OtpToken';
import { PasswordResetToken } from './PasswordResetToken';
import { ImportJob } from './ImportJob';
import { ImportError } from './ImportError';
import { normalizeCompareText, normalizeEmail, normalizeWebsite, phoneCompareKey } from '../utils/normalize';

/* ---------------------------------- hooks --------------------------------- */
// Keep normalized duplicate-detection keys in sync with the source fields.
function applyLeadKeys(lead: Lead) {
  lead.emailKey = normalizeEmail(lead.email);
  lead.phoneKey = phoneCompareKey(lead.phone);
  lead.websiteKey = normalizeWebsite(lead.website);
  lead.companyKey = normalizeCompareText(lead.companyName);
  lead.contactKey = normalizeCompareText(lead.contactName);
}
Lead.addHook('beforeValidate', applyLeadKeys);

/* ------------------------------- associations ----------------------------- */
User.hasMany(Lead, { as: 'assignedLeads', foreignKey: 'assignedBdeId', onDelete: 'SET NULL' });
Lead.belongsTo(User, { as: 'assignedBde', foreignKey: 'assignedBdeId' });

User.hasMany(Lead, { as: 'createdLeads', foreignKey: 'createdById', onDelete: 'SET NULL' });
Lead.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });

User.hasMany(Lead, { as: 'importedLeads', foreignKey: 'importedById', onDelete: 'SET NULL' });
Lead.belongsTo(User, { as: 'importer', foreignKey: 'importedById' });

Lead.hasMany(FollowUp, { as: 'followUps', foreignKey: 'leadId', onDelete: 'CASCADE' });
FollowUp.belongsTo(Lead, { as: 'lead', foreignKey: 'leadId' });

User.hasMany(FollowUp, { as: 'followUps', foreignKey: 'assignedToId', onDelete: 'SET NULL' });
FollowUp.belongsTo(User, { as: 'assignedTo', foreignKey: 'assignedToId' });
FollowUp.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });

Lead.hasMany(Activity, { as: 'activities', foreignKey: 'leadId', onDelete: 'CASCADE' });
Activity.belongsTo(Lead, { as: 'lead', foreignKey: 'leadId' });
User.hasMany(Activity, { as: 'activities', foreignKey: 'userId', onDelete: 'SET NULL' });
Activity.belongsTo(User, { as: 'user', foreignKey: 'userId' });

Lead.hasOne(Customer, { as: 'customer', foreignKey: 'sourceLeadId', onDelete: 'RESTRICT' });
Customer.belongsTo(Lead, { as: 'sourceLead', foreignKey: 'sourceLeadId' });
User.hasMany(Customer, { as: 'customers', foreignKey: 'assignedBdeId', onDelete: 'SET NULL' });
Customer.belongsTo(User, { as: 'assignedBde', foreignKey: 'assignedBdeId' });

User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.hasMany(OtpToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
OtpToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(PasswordResetToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(ImportJob, { as: 'importJobs', foreignKey: 'createdById', onDelete: 'SET NULL' });
ImportJob.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });
ImportJob.hasMany(ImportError, { as: 'errors', foreignKey: 'importJobId', onDelete: 'CASCADE' });
ImportError.belongsTo(ImportJob, { as: 'job', foreignKey: 'importJobId' });

export {
  sequelize,
  User,
  Lead,
  Customer,
  FollowUp,
  Activity,
  Notification,
  OtpToken,
  PasswordResetToken,
  ImportJob,
  ImportError,
};

export { toPublicUser } from './User';
