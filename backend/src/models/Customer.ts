import { DataTypes, InferAttributes, InferCreationAttributes, Model, CreationOptional } from 'sequelize';
import { sequelize } from '../config/database';

export class Customer extends Model<InferAttributes<Customer>, InferCreationAttributes<Customer>> {
  declare id: CreationOptional<number>;
  declare customerCode: string;
  declare sourceLeadId: number | null;
  declare companyName: string;
  declare contactName: string | null;
  declare designation: string | null;
  declare phone: string | null;
  declare email: string | null;
  declare website: string | null;
  declare country: string | null;
  declare state: string | null;
  declare city: string | null;
  declare service: string | null;
  declare assignedBdeId: number | null;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Customer.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    customerCode: { type: DataTypes.STRING(24), allowNull: false, unique: true },
    sourceLeadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, unique: true },
    companyName: { type: DataTypes.STRING(190), allowNull: false },
    contactName: { type: DataTypes.STRING(140), allowNull: true },
    designation: { type: DataTypes.STRING(140), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(190), allowNull: true },
    website: { type: DataTypes.STRING(190), allowNull: true },
    country: { type: DataTypes.STRING(90), allowNull: true },
    state: { type: DataTypes.STRING(90), allowNull: true },
    city: { type: DataTypes.STRING(90), allowNull: true },
    service: { type: DataTypes.STRING(190), allowNull: true },
    assignedBdeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customers',
    underscored: true,
    indexes: [
      { unique: true, fields: ['customer_code'] },
      { unique: true, fields: ['source_lead_id'] },
      { fields: ['assigned_bde_id'] },
      { fields: ['company_name'] },
      { fields: ['created_at'] },
    ],
  },
);
