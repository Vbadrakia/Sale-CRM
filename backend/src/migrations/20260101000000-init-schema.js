'use strict';

/** Initial CRM schema: users, leads, customers, followups, notifications,
 *  activities, otp_tokens, password_reset_tokens, import_jobs, import_errors. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, DATE, DATEONLY, BOOLEAN, ENUM, JSON: JSONTYPE } = Sequelize;
    const id = { type: INTEGER, autoIncrement: true, primaryKey: true };
    const timestamps = {
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };

    await queryInterface.createTable('users', {
      id,
      first_name: { type: STRING(80), allowNull: false },
      last_name: { type: STRING(80), allowNull: false },
      email: { type: STRING(190), allowNull: false, unique: true },
      phone: { type: STRING(30), allowNull: true },
      password_hash: { type: STRING(255), allowNull: false },
      role: { type: ENUM('ADMIN', 'BDE'), allowNull: false, defaultValue: 'BDE' },
      is_active: { type: BOOLEAN, allowNull: false, defaultValue: true },
      email_verified: { type: BOOLEAN, allowNull: false, defaultValue: false },
      last_login_at: { type: DATE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('users', ['role']);
    await queryInterface.addIndex('users', ['is_active']);

    await queryInterface.createTable('leads', {
      id,
      lead_code: { type: STRING(24), allowNull: false, unique: true },
      company_name: { type: STRING(190), allowNull: false },
      contact_name: { type: STRING(140), allowNull: true },
      designation: { type: STRING(140), allowNull: true },
      phone: { type: STRING(30), allowNull: true },
      alternate_phone: { type: STRING(30), allowNull: true },
      email: { type: STRING(190), allowNull: true },
      alternate_email: { type: STRING(190), allowNull: true },
      website: { type: STRING(190), allowNull: true },
      country: { type: STRING(90), allowNull: true },
      state: { type: STRING(90), allowNull: true },
      city: { type: STRING(90), allowNull: true },
      industry: { type: STRING(120), allowNull: true },
      company_size: { type: STRING(60), allowNull: true },
      service_required: { type: STRING(190), allowNull: true },
      lead_source: { type: STRING(90), allowNull: true },
      status: {
        type: ENUM('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'),
        allowNull: false,
        defaultValue: 'NEW',
      },
      priority: { type: ENUM('LOW', 'MEDIUM', 'HIGH'), allowNull: false, defaultValue: 'MEDIUM' },
      assigned_bde_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      last_contacted_at: { type: DATE, allowNull: true },
      next_follow_up_at: { type: DATE, allowNull: true },
      converted_at: { type: DATE, allowNull: true },
      won_at: { type: DATE, allowNull: true },
      lost_at: { type: DATE, allowNull: true },
      lost_reason: { type: STRING(500), allowNull: true },
      tags: { type: STRING(500), allowNull: true },
      notes: { type: TEXT, allowNull: true },
      remarks: { type: TEXT, allowNull: true },
      email_key: { type: STRING(190), allowNull: true },
      phone_key: { type: STRING(30), allowNull: true },
      website_key: { type: STRING(190), allowNull: true },
      company_key: { type: STRING(190), allowNull: true },
      contact_key: { type: STRING(140), allowNull: true },
      deleted_at: { type: DATE, allowNull: true },
      ...timestamps,
    });
    for (const fields of [
      ['email_key'],
      ['phone_key'],
      ['website_key'],
      ['company_key', 'contact_key'],
      ['status'],
      ['priority'],
      ['assigned_bde_id'],
      ['lead_source'],
      ['created_at'],
      ['next_follow_up_at'],
    ]) {
      await queryInterface.addIndex('leads', fields);
    }

    await queryInterface.createTable('customers', {
      id,
      customer_code: { type: STRING(24), allowNull: false, unique: true },
      source_lead_id: {
        type: INTEGER,
        allowNull: true,
        unique: true,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      company_name: { type: STRING(190), allowNull: false },
      contact_name: { type: STRING(140), allowNull: true },
      designation: { type: STRING(140), allowNull: true },
      phone: { type: STRING(30), allowNull: true },
      email: { type: STRING(190), allowNull: true },
      website: { type: STRING(190), allowNull: true },
      country: { type: STRING(90), allowNull: true },
      state: { type: STRING(90), allowNull: true },
      city: { type: STRING(90), allowNull: true },
      service: { type: STRING(190), allowNull: true },
      assigned_bde_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      notes: { type: TEXT, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('customers', ['assigned_bde_id']);
    await queryInterface.addIndex('customers', ['company_name']);
    await queryInterface.addIndex('customers', ['created_at']);

    await queryInterface.createTable('followups', {
      id,
      lead_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_by_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      assigned_to_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      title: { type: STRING(190), allowNull: false },
      description: { type: TEXT, allowNull: true },
      due_date: { type: DATEONLY, allowNull: false },
      due_time: { type: STRING(8), allowNull: true },
      due_at: { type: DATE, allowNull: false },
      status: { type: ENUM('PENDING', 'COMPLETED', 'CANCELLED'), allowNull: false, defaultValue: 'PENDING' },
      outcome: { type: TEXT, allowNull: true },
      completed_at: { type: DATE, allowNull: true },
      reminder_sent_at: { type: DATE, allowNull: true },
      overdue_notified_at: { type: DATE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('followups', ['lead_id']);
    await queryInterface.addIndex('followups', ['assigned_to_id']);
    await queryInterface.addIndex('followups', ['status']);
    await queryInterface.addIndex('followups', ['due_at']);

    await queryInterface.createTable('activities', {
      id,
      lead_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      activity_type: { type: STRING(40), allowNull: false },
      description: { type: STRING(500), allowNull: false },
      metadata: { type: JSONTYPE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('activities', ['lead_id']);
    await queryInterface.addIndex('activities', ['user_id']);
    await queryInterface.addIndex('activities', ['created_at']);

    await queryInterface.createTable('notifications', {
      id,
      user_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: { type: STRING(40), allowNull: false },
      title: { type: STRING(190), allowNull: false },
      message: { type: STRING(500), allowNull: false },
      entity_type: { type: STRING(40), allowNull: true },
      entity_id: { type: INTEGER, allowNull: true },
      dedupe_key: { type: STRING(190), allowNull: true, unique: true },
      is_read: { type: BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps,
    });
    await queryInterface.addIndex('notifications', ['user_id', 'is_read']);
    await queryInterface.addIndex('notifications', ['created_at']);

    await queryInterface.createTable('otp_tokens', {
      id,
      user_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      purpose: { type: STRING(30), allowNull: false, defaultValue: 'ACCOUNT_VERIFICATION' },
      code_hash: { type: STRING(255), allowNull: false },
      expires_at: { type: DATE, allowNull: false },
      attempts: { type: INTEGER, allowNull: false, defaultValue: 0 },
      consumed_at: { type: DATE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('otp_tokens', ['user_id', 'purpose']);
    await queryInterface.addIndex('otp_tokens', ['expires_at']);

    await queryInterface.createTable('password_reset_tokens', {
      id,
      user_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: { type: STRING(190), allowNull: false, unique: true },
      expires_at: { type: DATE, allowNull: false },
      used_at: { type: DATE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('password_reset_tokens', ['user_id']);

    await queryInterface.createTable('import_jobs', {
      id,
      created_by_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      file_name: { type: STRING(255), allowNull: false },
      status: {
        type: ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      total_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      valid_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      invalid_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      duplicate_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      imported_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      skipped_rows: { type: INTEGER, allowNull: false, defaultValue: 0 },
      duplicate_strategy: { type: STRING(20), allowNull: false, defaultValue: 'SKIP' },
      error_message: { type: STRING(500), allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('import_jobs', ['created_by_id']);
    await queryInterface.addIndex('import_jobs', ['created_at']);

    await queryInterface.createTable('import_errors', {
      id,
      import_job_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'import_jobs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      row_number: { type: INTEGER, allowNull: false },
      reason: { type: STRING(500), allowNull: false },
      row_data: { type: JSONTYPE, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex('import_errors', ['import_job_id']);
  },

  async down(queryInterface) {
    for (const table of [
      'import_errors',
      'import_jobs',
      'password_reset_tokens',
      'otp_tokens',
      'notifications',
      'activities',
      'followups',
      'customers',
      'leads',
      'users',
    ]) {
      await queryInterface.dropTable(table);
    }
  },
};
