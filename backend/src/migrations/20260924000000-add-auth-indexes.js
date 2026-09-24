'use strict';

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    await queryInterface.addIndex('users', ['id'], { name: 'idx_user_id' });
    await queryInterface.addIndex('users', ['email'], { name: 'idx_user_email' });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', 'idx_user_id');
    await queryInterface.removeIndex('users', 'idx_user_email');
  },
};
