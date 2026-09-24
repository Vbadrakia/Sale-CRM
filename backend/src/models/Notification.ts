import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { NotificationType } from '../types';

export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare type: NotificationType;
  declare title: string;
  declare message: string;
  declare entityType: string | null;
  declare entityId: number | null;
  declare dedupeKey: CreationOptional<string | null>;
  declare isRead: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Notification.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(190), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    entityType: { type: DataTypes.STRING(40), allowNull: true },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    // Guarantees repeated job runs cannot create duplicate notifications.
    dedupeKey: { type: DataTypes.STRING(190), allowNull: true, unique: true },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'notifications',
    underscored: true,
    indexes: [
      { fields: ['user_id', 'is_read'] },
      { unique: true, fields: ['dedupe_key'] },
      { fields: ['created_at'] },
    ],
  },
);
