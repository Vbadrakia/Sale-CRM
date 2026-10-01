import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { LeadPriority, LeadStatus } from '../types';

export class Lead extends Model<InferAttributes<Lead>, InferCreationAttributes<Lead>> {
  declare id: CreationOptional<number>;
  declare leadCode: string;

  declare companyName: string;
  declare contactName: string | null;
  declare designation: string | null;
  declare phone: string | null;
  declare alternatePhone: string | null;
  declare email: string | null;
  declare alternateEmail: string | null;
  declare website: string | null;

  declare country: string | null;
  declare state: string | null;
  declare city: string | null;
  declare industry: string | null;
  declare companySize: string | null;
  declare serviceRequired: string | null;
  declare leadSource: string | null;

  declare status: CreationOptional<LeadStatus>;
  declare priority: CreationOptional<LeadPriority>;
  declare assignedBdeId: number | null;
  declare createdById: number | null;
  declare importedById: number | null;
  declare importJobId: number | null;

  declare lastContactedAt: CreationOptional<Date | null>;
  declare nextFollowUpAt: CreationOptional<Date | null>;
  declare convertedAt: CreationOptional<Date | null>;
  declare wonAt: CreationOptional<Date | null>;
  declare lostAt: CreationOptional<Date | null>;
  declare lostReason: CreationOptional<string | null>;

  declare tags: CreationOptional<string | null>;
  declare notes: CreationOptional<string | null>;
  declare remarks: CreationOptional<string | null>;

  // Normalized duplicate-detection keys, maintained by hooks.
  declare emailKey: CreationOptional<string | null>;
  declare phoneKey: CreationOptional<string | null>;
  declare websiteKey: CreationOptional<string | null>;
  declare companyKey: CreationOptional<string | null>;
  declare contactKey: CreationOptional<string | null>;

  declare deletedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Lead.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadCode: { type: DataTypes.STRING(24), allowNull: false, unique: true },

    companyName: { type: DataTypes.STRING(190), allowNull: false },
    contactName: { type: DataTypes.STRING(140), allowNull: true },
    designation: { type: DataTypes.STRING(140), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    alternatePhone: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(190), allowNull: true },
    alternateEmail: { type: DataTypes.STRING(190), allowNull: true },
    website: { type: DataTypes.STRING(190), allowNull: true },

    country: { type: DataTypes.STRING(90), allowNull: true },
    state: { type: DataTypes.STRING(90), allowNull: true },
    city: { type: DataTypes.STRING(90), allowNull: true },
    industry: { type: DataTypes.STRING(120), allowNull: true },
    companySize: { type: DataTypes.STRING(60), allowNull: true },
    serviceRequired: { type: DataTypes.STRING(190), allowNull: true },
    leadSource: { type: DataTypes.STRING(90), allowNull: true },

    status: {
      type: DataTypes.ENUM('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'),
      allowNull: false,
      defaultValue: 'NEW',
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    assignedBdeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    importedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    importJobId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

    lastContactedAt: { type: DataTypes.DATE, allowNull: true },
    nextFollowUpAt: { type: DataTypes.DATE, allowNull: true },
    convertedAt: { type: DataTypes.DATE, allowNull: true },
    wonAt: { type: DataTypes.DATE, allowNull: true },
    lostAt: { type: DataTypes.DATE, allowNull: true },
    lostReason: { type: DataTypes.STRING(500), allowNull: true },

    tags: { type: DataTypes.STRING(500), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },

    emailKey: { type: DataTypes.STRING(190), allowNull: true },
    phoneKey: { type: DataTypes.STRING(30), allowNull: true },
    websiteKey: { type: DataTypes.STRING(190), allowNull: true },
    companyKey: { type: DataTypes.STRING(190), allowNull: true },
    contactKey: { type: DataTypes.STRING(140), allowNull: true },

    deletedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'leads',
    underscored: true,
    paranoid: true,
    indexes: [
      { unique: true, fields: ['lead_code'] },
      { fields: ['email_key'] },
      { fields: ['phone_key'] },
      { fields: ['website_key'] },
      { fields: ['company_key', 'contact_key'] },
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['assigned_bde_id'] },
      { fields: ['imported_by_id'] },
      { fields: ['import_job_id'] },
      { fields: ['lead_source'] },
      { fields: ['created_at'] },
      { fields: ['next_follow_up_at'] },
    ],
  },
);
