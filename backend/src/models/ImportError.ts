import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';

export class ImportError extends Model<
  InferAttributes<ImportError>,
  InferCreationAttributes<ImportError>
> {
  declare id: CreationOptional<number>;
  declare importJobId: number;
  declare rowNumber: number;
  declare reason: string;
  declare rowData: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ImportError.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    importJobId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    rowNumber: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    rowData: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'import_errors', underscored: true, indexes: [{ fields: ['import_job_id'] }] },
);
