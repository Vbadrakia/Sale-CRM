import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { FollowUpStatus } from '../types';

export class FollowUp extends Model<InferAttributes<FollowUp>, InferCreationAttributes<FollowUp>> {
  declare id: CreationOptional<number>;
  declare leadId: number;
  declare createdById: number | null;
  declare assignedToId: number | null;
  declare title: string;
  declare description: string | null;
  declare dueDate: string; // YYYY-MM-DD
  declare dueTime: CreationOptional<string | null>; // HH:mm:ss
  declare dueAt: Date;
  declare status: CreationOptional<FollowUpStatus>;
  declare outcome: CreationOptional<string | null>;
  declare completedAt: CreationOptional<Date | null>;
  declare reminderSentAt: CreationOptional<Date | null>;
  declare overdueNotifiedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

FollowUp.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    title: { type: DataTypes.STRING(190), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    dueTime: { type: DataTypes.STRING(8), allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    outcome: { type: DataTypes.TEXT, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    reminderSentAt: { type: DataTypes.DATE, allowNull: true },
    overdueNotifiedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'followups',
    underscored: true,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['assigned_to_id'] },
      { fields: ['status'] },
      { fields: ['due_at'] },
    ],
  },
);
