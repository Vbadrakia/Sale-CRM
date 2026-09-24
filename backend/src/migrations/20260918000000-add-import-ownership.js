'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'imported_by_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('leads', 'import_job_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'import_jobs', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('leads', ['imported_by_id']);
    await queryInterface.addIndex('leads', ['import_job_id']);

    // Preserve ownership for imports created before this migration.
    // PostgreSQL / ANSI compliant UPDATE FROM syntax
    await queryInterface.sequelize.query(
      "UPDATE leads SET imported_by_id = leads.created_by_id FROM activities WHERE activities.lead_id = leads.id AND leads.imported_by_id IS NULL AND activities.activity_type = 'LEAD_IMPORTED' AND leads.created_by_id IS NOT NULL",
    );
    await queryInterface.sequelize.query(
      "UPDATE leads SET imported_by_id = created_by_id WHERE imported_by_id IS NULL AND lead_source = 'Import' AND created_by_id IS NOT NULL",
    );
    await queryInterface.sequelize.query(
      "UPDATE leads SET assigned_bde_id = leads.imported_by_id FROM users WHERE users.id = leads.imported_by_id AND users.role = 'BDE' AND (leads.assigned_bde_id IS NULL OR leads.assigned_bde_id <> leads.imported_by_id)",
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('leads', ['import_job_id']);
    await queryInterface.removeIndex('leads', ['imported_by_id']);
    await queryInterface.removeColumn('leads', 'import_job_id');
    await queryInterface.removeColumn('leads', 'imported_by_id');
  },
};
