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
    firstName: { type: DataTypes.STRING(80), allowNull: false, field: 'first_name' },
    lastName: { type: DataTypes.STRING(80), allowNull: false, field: 'last_name' },
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    role: { type: DataTypes.ENUM('ADMIN', 'BDE'), allowNull: false, defaultValue: 'BDE' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'email_verified' },
    tokenVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, field: 'token_version' },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
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

export function toPublicUser(user: User) {
  const u = (typeof user.get === 'function' ? user.get({ plain: true }) : user) as Record<string, unknown>;
  const fName = String(u.firstName || u.first_name || '');
  const lName = String(u.lastName || u.last_name || '');
  return {
    id: u.id,
    firstName: fName,
    lastName: lName,
    fullName: `${fName} ${lName}`.trim(),
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    isActive: Boolean(u.isActive ?? u.is_active ?? true),
    emailVerified: Boolean(u.emailVerified ?? u.email_verified ?? false),
    lastLoginAt: u.lastLoginAt || u.last_login_at || null,
    createdAt: u.createdAt || u.created_at,
    updatedAt: u.updatedAt || u.updated_at,
  };
}
