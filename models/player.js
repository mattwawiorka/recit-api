const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Player = sequelize.define('player', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  role: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: "1"
  }
});

/**
 * Role:
 *      1 - Host
 *      2 - Joined
 *      3 - Interested
 *      4 - Invited
 */

module.exports = Player;