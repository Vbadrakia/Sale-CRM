import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';
import { ImportJobStatus } from '../types';

export class ImportJob extends Model<InferAttributes<ImportJob>, InferCreationAttributes<ImportJob>> {
  declare id: CreationOptional<number>;
  declare createdById: number | null;
  declare fileName: string;
  declare status: CreationOptional<ImportJobStatus>;
  declare totalRows: CreationOptional<number>;
  declare validRows: CreationOptional<number>;
  declare invalidRows: CreationOptional<number>;
  declare duplicateRows: CreationOptional<number>;
  declare importedRows: CreationOptional<number>;
  declare skippedRows: CreationOptional<number>;
  declare duplicateStrategy: CreationOptional<string>;
  declare idempotencyKey: CreationOptional<string | null>;
  declare errorMessage: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ImportJob.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    totalRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    validRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    invalidRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duplicateRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    importedRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skippedRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duplicateStrategy: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'SKIP' },
    idempotencyKey: { type: DataTypes.STRING(128), allowNull: true },
    errorMessage: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'import_jobs', underscored: true, indexes: [{ fields: ['created_by_id'] }, { fields: ['created_at'] }, { unique: true, fields: ['created_by_id', 'idempotency_key'] }] },
);
