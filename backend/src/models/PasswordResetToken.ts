import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';

export class PasswordResetToken extends Model<
  InferAttributes<PasswordResetToken>,
  InferCreationAttributes<PasswordResetToken>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  /** sha256 of the emailed token. */
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PasswordResetToken.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'password_reset_tokens',
    underscored: true,
    indexes: [{ unique: true, fields: ['token_hash'] }, { fields: ['user_id'] }],
  },
);
