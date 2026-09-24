'use strict';

/** Migration: adds token_version to users, idempotency_key to import_jobs, and lead_code_seq / customer_code_seq sequences */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add token_version to users
    const userCols = await queryInterface.describeTable('users');
    if (!userCols.token_version) {
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }

    // 2. Add idempotency_key and expand status ENUM on import_jobs
    const jobCols = await queryInterface.describeTable('import_jobs');
    if (!jobCols.idempotency_key) {
      await queryInterface.addColumn('import_jobs', 'idempotency_key', {
        type: Sequelize.STRING(128),
        allowNull: true,
      });
    }
    // Remove old single-column unique index if it exists
    await queryInterface.removeIndex('import_jobs', 'idx_import_jobs_idempotency_key_unique').catch(() => undefined);
    await queryInterface.addIndex('import_jobs', ['created_by_id', 'idempotency_key'], {
      name: 'idx_import_jobs_user_idempotency_unique',
      unique: true,
    }).catch(() => undefined);

    await queryInterface.sequelize.query("ALTER TYPE enum_import_jobs_status ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';").catch(() => undefined);
    await queryInterface.sequelize.query("ALTER TYPE enum_import_jobs_status ADD VALUE IF NOT EXISTS 'CANCELLED';").catch(() => undefined);

    // 3. Create sequences and initialize safely from existing data
    await queryInterface.sequelize.query('CREATE SEQUENCE IF NOT EXISTS lead_code_seq;');
    await queryInterface.sequelize.query('CREATE SEQUENCE IF NOT EXISTS customer_code_seq;');

    await queryInterface.sequelize.query(
      "SELECT setval('lead_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(lead_code FROM '[0-9]+$') AS INTEGER)) FROM leads), 0) + 1, false);",
    );
    await queryInterface.sequelize.query(
      "SELECT setval('customer_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(customer_code FROM '[0-9]+$') AS INTEGER)) FROM customers), 0) + 1, false);",
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('import_jobs', 'idx_import_jobs_idempotency_key_unique').catch(() => undefined);
    await queryInterface.removeColumn('import_jobs', 'idempotency_key').catch(() => undefined);
    await queryInterface.removeColumn('users', 'token_version').catch(() => undefined);
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS lead_code_seq;').catch(() => undefined);
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS customer_code_seq;').catch(() => undefined);
  },
};
