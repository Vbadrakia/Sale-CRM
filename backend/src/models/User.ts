import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { UserRole } from '../types';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare phone: string | null;
  declare passwordHash: string;
  declare role: UserRole;
  declare isActive: CreationOptional<boolean>;
  declare emailVerified: CreationOptional<boolean>;
  declare tokenVersion: CreationOptional<number>;
  declare lastLoginAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function fullName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

User.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    firstName: { type: DataTypes.STRING(80), allowNull: false },
    lastName: { type: DataTypes.STRING(80), allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('ADMIN', 'BDE'), allowNull: false, defaultValue: 'BDE' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    tokenVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    underscored: true,
    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
    ],
  },
);

/** Shape returned by the API — never includes the password hash. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
