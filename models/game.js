const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Game = sequelize.define('game', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  title: {
    type: Sequelize.STRING,
    allowNull: false
  },
  dateTime: {
    type: Sequelize.DATE,
    allowNull: false
  },
  endDateTime: {
    type: Sequelize.DATE,
    allowNull: false
  },
  venue: {
    type: Sequelize.STRING,
    allowNull: false
  },
  address: {
    type: Sequelize.STRING,
    allowNull: false
  },
  sport: {
    type: Sequelize.STRING(50),
    allowNull: false
  },
  players: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  description: {
    type: Sequelize.STRING(1000)
  },
  image : {
    type: Sequelize.STRING
  },
  public : {
    type: Sequelize.BOOLEAN,
    allowNull: false
  }
});

module.exports = Game;