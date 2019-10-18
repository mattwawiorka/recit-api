const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const GamePlayer = sequelize.define('gamePlayer', {
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

module.exports = GamePlayer;