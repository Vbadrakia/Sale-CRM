import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';

export class OtpToken extends Model<InferAttributes<OtpToken>, InferCreationAttributes<OtpToken>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare purpose: CreationOptional<string>;
  /** bcrypt hash of the 6-digit code. The raw code is never stored. */
  declare codeHash: string;
  declare expiresAt: Date;
  declare attempts: CreationOptional<number>;
  declare consumedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OtpToken.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    purpose: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ACCOUNT_VERIFICATION' },
    codeHash: { type: DataTypes.STRING(255), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'otp_tokens',
    underscored: true,
    indexes: [{ fields: ['user_id', 'purpose'] }, { fields: ['expires_at'] }],
  },
);
