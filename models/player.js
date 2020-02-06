const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Player = sequelize.define('player', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    level: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: "2"
    }
  }
);

/**
 * Level:
 *      1 - Host
 *      2 - Joined
 *      3 - Reserved
 */

module.exports = Player;