import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { ActivityType } from '../types';

export class Activity extends Model<InferAttributes<Activity>, InferCreationAttributes<Activity>> {
  declare id: CreationOptional<number>;
  declare leadId: number | null;
  declare userId: number | null;
  declare activityType: ActivityType;
  declare description: string;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Activity.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    activityType: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'activities',
    underscored: true,
    indexes: [{ fields: ['lead_id'] }, { fields: ['user_id'] }, { fields: ['created_at'] }],
  },
);
