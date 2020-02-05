const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Participant = sequelize.define('participant', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    invited: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    level: {
      type: Sequelize.INTEGER,
      defaultValue: 1
    },
    hasUpdate: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    }
  },
  {
    indexes: [
      {
        fields: ['updatedAt']
      }
    ]
  }
);

/**
 * Level:
 *      1 - Joined
 *      2 - Interested
 *      3 - Invited
 */

module.exports = Participant;