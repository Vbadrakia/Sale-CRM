import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class RateLimit extends Model<InferAttributes<RateLimit>, InferCreationAttributes<RateLimit>> {
  declare key: string;
  declare points: number;
  declare expireAt: Date;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}

RateLimit.init(
  {
    key: { type: DataTypes.STRING(255), primaryKey: true },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    expireAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'rate_limits',
    underscored: true,
    indexes: [{ fields: ['expire_at'] }],
  },
);
